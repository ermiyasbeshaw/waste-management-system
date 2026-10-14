import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { asIdentity, asRole, certificateToken, testDb } from "./helpers";

/**
 * Gate 5: check-in, exception, destruction and the certificate through the real UI and HTTP API. Each test builds
 * its own truck load (facility, hospital user, driver, vehicle, trip, collected containers). The certificate job is
 * not run here: it would also issue the seeded PENDING / FAILED demo certificates (integration tests cover it).
 */

const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

async function truckLoad(n: number) {
  const code = `EE-${letters()}-${digits(3)}`;
  const name = `E2E Disposal Clinic ${code}`;
  const [f] = await testDb<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'E2E road', 9.6, 41.85) RETURNING id`,
    [code, name]
  );
  const hospitalId = `e2e_dsh_${randomUUID().slice(0, 13)}`;
  const [hu] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_admin', $2, 'E2E Disposal Admin', $3) RETURNING id`,
    [hospitalId, f.id, `${hospitalId}@example.test`]
  );
  const driverId = `e2e_dsd_${randomUUID().slice(0, 13)}`;
  const [du] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'E2E Disposal Driver', $2) RETURNING id`,
    [driverId, `${driverId}@example.test`]
  );
  const [d] = await testDb<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, 'ON_TRIP') RETURNING id`,
    [du.id, `E2E-${digits(8)}`]
  );
  const [v] = await testDb<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, 'IN_TRANSIT') RETURNING id`,
    [`E2E-${digits(6)}`]
  );
  const tripCode = `TR-99${digits(4)}-${digits(2)}`;
  const [t] = await testDb<{ id: string }>(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
     VALUES ($1, $2, $3, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'IN_PROGRESS', now() - interval '2 hours') RETURNING id`,
    [tripCode, v.id, d.id]
  );
  const [s] = await testDb<{ id: string }>(
    `INSERT INTO trip_stops (trip_id, facility_id, priority_order, status, arrived_at, completed_at, collection_method, confirmed_by)
     VALUES ($1, $2, 1, 'COLLECTED', now() - interval '90 minutes', now() - interval '80 minutes', 'IN_APP', $3) RETURNING id`,
    [t.id, f.id, hu.id]
  );
  const [cat] = await testDb<{ id: string }>(
    `SELECT id FROM waste_categories WHERE code = 'SHARPS'`
  );
  const wasteCode = `WR-99${digits(2)}-${digits(5)}`;
  const [w] = await testDb<{ id: string }>(
    `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status)
     VALUES ($1, $2, $3, $4, 8, $5, 'IN_TRANSIT') RETURNING id`,
    [wasteCode, f.id, cat.id, n, hu.id]
  );
  await testDb(`INSERT INTO trip_stop_waste (trip_stop_id, waste_record_id) VALUES ($1, $2)`, [
    s.id,
    w.id,
  ]);
  const codes: string[] = [];
  for (let i = 1; i <= n; i++) {
    const c = `${wasteCode}-C${String(i).padStart(2, "0")}`;
    const [ct] = await testDb<{ id: string }>(
      `INSERT INTO containers (container_code, waste_record_id, seq_no, status) VALUES ($1, $2, $3, 'COLLECTED') RETURNING id`,
      [c, w.id, i]
    );
    // The pickup scan evidence (NO PARTIAL PICKUP: a completed stop has a scan for every container).
    await testDb(
      `INSERT INTO handovers (trip_stop_id, container_id, driver_id) VALUES ($1, $2, $3)`,
      [s.id, ct.id, d.id]
    );
    codes.push(c);
  }
  return {
    wasteId: w.id,
    wasteCode,
    codes,
    tripId: t.id,
    tripCode,
    hospitalId,
    facilityName: name,
  };
}

test.describe("disposal (Gate 5)", () => {
  test("operator: check in, mark one missing, destroy → certificate prepared; trip completes", async ({
    page,
  }) => {
    const load = await truckLoad(3);
    await asRole(page, "disposal_operator");
    await page.goto("/disposal/inbound");
    await expect(page.getByText(load.tripCode).first()).toBeVisible();

    for (const code of load.codes.slice(0, 2)) {
      await page.getByLabel("Container code").fill(code);
      await page.getByRole("button", { name: "Scan", exact: true }).click();
      await expect(page.getByText(new RegExp(`${code}: Received`))).toBeVisible();
    }
    const row = page.locator("li", { hasText: load.codes[2] });
    await row.getByRole("button", { name: "Missing / refused…" }).click();
    await row.getByLabel("Reason (required)").fill("Not on the truck at arrival");
    await row.getByRole("button", { name: "Mark missing" }).click();
    await expect(page.getByText(`${load.codes[2]} marked missing`)).toBeVisible();

    const [trip] = await testDb<{ status: string }>(`SELECT status FROM trips WHERE id = $1`, [
      load.tripId,
    ]);
    expect(trip.status).toBe("COMPLETED");

    await page.goto("/disposal");
    const waste = page.locator("li", { hasText: load.wasteCode });
    await waste.getByRole("button", { name: "Record destruction" }).click();
    await waste.getByRole("button", { name: "Yes, destroyed" }).click();
    await expect(
      waste.getByText(/destroyed\. Certificate CD-\d{4}-\d{5} is being prepared\./)
    ).toBeVisible();

    const [w] = await testDb<{ status: string }>(`SELECT status FROM waste_records WHERE id = $1`, [
      load.wasteId,
    ]);
    expect(w.status).toBe("DISPOSED_WITH_EXCEPTION");
    const [cert] = await testDb<{ status: string; certificate_no: string }>(
      `SELECT c.status, c.certificate_no FROM certificates c JOIN disposal_records d ON d.id = c.disposal_record_id
       WHERE d.waste_record_id = $1`,
      [load.wasteId]
    );
    expect(cert.status).toBe("PENDING");

    // The hospital sees the certificate as "being prepared" (no download before it is issued).
    await asIdentity(page, load.hospitalId, "hospital_admin");
    await page.goto("/hospital/certificates");
    await expect(page.getByText(cert.certificate_no).first()).toBeVisible();
  });

  test("API: idempotency key required, EFDA 403, replay is one action, reason required", async ({
    page,
  }) => {
    const load = await truckLoad(2);
    const post = (path: string, data: unknown, key?: string) =>
      page.request.post(path, { headers: key ? { "Idempotency-Key": key } : {}, data });

    await asRole(page, "efda_officer");
    expect(
      (await post("/api/disposal/receive", { containerCode: load.codes[0] }, randomUUID())).status()
    ).toBe(403);

    await asRole(page, "disposal_operator");
    expect((await post("/api/disposal/receive", { containerCode: load.codes[0] })).status()).toBe(
      400
    );
    const key = randomUUID();
    const a = await post("/api/disposal/receive", { containerCode: load.codes[0] }, key);
    const b = await post("/api/disposal/receive", { containerCode: load.codes[0] }, key);
    expect(a.status(), await a.text()).toBe(200);
    expect(await b.json()).toEqual(await a.json());
    const again = await post(
      "/api/disposal/receive",
      { containerCode: load.codes[0] },
      randomUUID()
    );
    expect((await again.json()).error.code).toBe("ALREADY_RECEIVED");
    const noReason = await post(
      "/api/disposal/exception",
      { containerCode: load.codes[1], kind: "REFUSED", reason: "" },
      randomUUID()
    );
    expect(noReason.status()).toBe(422);
  });

  test("public file check: a different file does not match; unknown token 404", async ({
    request,
  }) => {
    const token = await certificateToken("ISSUED");
    const res = await request.post(`/api/verify/${token}/check-file`, {
      multipart: {
        file: {
          name: "fake.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 fake"),
        },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ match: false, status: "ISSUED" });
    const unknown = await request.post("/api/verify/unknown-token-0000000000000/check-file", {
      data: "x",
    });
    expect(unknown.status()).toBe(404);
  });
});
