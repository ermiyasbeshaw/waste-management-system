import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { asIdentity, asRole, testDb } from "./helpers";

/**
 * Gate 7.3 failure paths that were not yet covered end to end. The others are covered elsewhere:
 * double tap, wrong OTP, missing key, skip → pickup.spec.ts; SMS down → in-app confirmation → pickup.spec.ts;
 * missing / refused container, replayed check-in → disposal.spec.ts; tracker replay / future timestamps →
 * tracking.spec.ts; certificate generation failure (destruction kept, retry) → tests/integration/disposal.test.ts.
 */

const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

async function driver(tag: string) {
  const clerk = `e2e_${tag}_${randomUUID().slice(0, 13)}`;
  const [u] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'E2E Reassign Driver', $2) RETURNING id`,
    [clerk, `${clerk}@example.test`]
  );
  const [d] = await testDb<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no) VALUES ($1, $2) RETURNING id`,
    [u.id, `E2E-${digits(8)}`]
  );
  return { clerk, driverId: d.id };
}

test("reassignment: the former driver loses access at once; the new driver can start the trip", async ({
  page,
}) => {
  const code = `ER-${letters()}-${digits(3)}`;
  const [f] = await testDb<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'E2E road', 9.6, 41.85) RETURNING id`,
    [code, `E2E Reassign Clinic ${code}`]
  );
  const a = await driver("dra");
  const b = await driver("drb");
  const [v] = await testDb<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg) VALUES ($1, 2000) RETURNING id`,
    [`E2E-${digits(6)}`]
  );
  const [t] = await testDb<{ id: string }>(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status)
     VALUES ($1, $2, $3, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'PLANNED') RETURNING id`,
    [`TR-99${digits(4)}-${digits(2)}`, v.id, a.driverId]
  );
  await testDb(`INSERT INTO trip_stops (trip_id, facility_id, priority_order) VALUES ($1, $2, 1)`, [
    t.id,
    f.id,
  ]);
  const post = (path: string, data: unknown) =>
    page.request.post(path, { headers: { "Idempotency-Key": randomUUID() }, data });

  await asRole(page, "super_admin");
  const re = await post(`/api/trips/${t.id}/reassign`, { driverId: b.driverId });
  expect(re.status(), await re.text()).toBe(200);

  await asIdentity(page, a.clerk, "driver");
  const old = await post(`/api/trips/${t.id}/start`, {});
  expect([403, 404]).toContain(old.status()); // no longer this driver's trip

  await asIdentity(page, b.clerk, "driver");
  const ok = await post(`/api/trips/${t.id}/start`, {});
  expect(ok.status(), await ok.text()).toBe(200);
});
