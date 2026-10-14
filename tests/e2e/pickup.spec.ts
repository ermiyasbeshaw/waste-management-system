import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { unseal } from "../../src/server/outbox/seal";
import { asIdentity, asRole, testDb } from "./helpers";

/**
 * Gate 3.12: the pickup through the real UI and HTTP API (Next server on the Neon `test` branch).
 * Every test builds its own world — facility, hospital recipient, vehicle, driver, waste, trip — with throw-away
 * `e2e_…` identities, so runs are repeatable and the seeded demo data is never touched.
 */

const OUTBOX_KEY = parse(readFileSync(".env.local")).OUTBOX_ENCRYPTION_KEY;
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");
const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const id = (prefix: string) => `e2e_${prefix}_${randomUUID().slice(0, 13)}`;

/**
 * A fresh world. `trip`: none (only waiting waste), PLANNED today with one PENDING stop, or IN_PROGRESS with the
 * truck ARRIVED and every container already scanned (for the hospital in-app confirmation).
 */
async function world(opts: { containers?: number; trip?: "PLANNED" | "IN_PROGRESS" } = {}) {
  const containers = opts.containers ?? 2;
  const inProgress = opts.trip === "IN_PROGRESS";
  const code = `EE-${letters()}-${digits(3)}`;
  const name = `E2E Clinic ${code}`;
  const [f] = await testDb<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'E2E road', 9.6, 41.85) RETURNING id`,
    [code, name]
  );
  const hospitalId = id("hospital");
  const phone = `+2519${digits(8)}`;
  const [hu] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email, phone_e164, phone_verified, receives_pickup_otp)
     VALUES ($1, 'hospital_admin', $2, 'E2E Recipient', $3, $4, true, true) RETURNING id`,
    [hospitalId, f.id, `${hospitalId}@example.test`, phone]
  );
  const driverId = id("driver");
  const [du] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'E2E Driver', $2) RETURNING id`,
    [driverId, `${driverId}@example.test`]
  );
  const [d] = await testDb<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, $3::driver_status) RETURNING id`,
    [du.id, `E2E-${digits(8)}`, inProgress ? "ON_TRIP" : "ON_DUTY"]
  );
  const [v] = await testDb<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, $2::vehicle_status) RETURNING id`,
    [`E2E-${digits(6)}`, inProgress ? "IN_TRANSIT" : "ACTIVE"]
  );

  const wasteCode = `WR-9912-${digits(5)}`;
  const [cat] = await testDb<{ id: string }>(
    `SELECT id FROM waste_categories WHERE code = 'SHARPS'`
  );
  const [w] = await testDb<{ id: string }>(
    `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status)
     VALUES ($1, $2, $3, $4, 6, $5, $6::waste_status) RETURNING id`,
    [wasteCode, f.id, cat.id, containers, hu.id, opts.trip ? "SCHEDULED" : "REGISTERED"]
  );
  const codes = Array.from(
    { length: containers },
    (_, i) => `${wasteCode}-C${String(i + 1).padStart(2, "0")}`
  );
  const containerIds: string[] = [];
  for (let i = 0; i < codes.length; i++) {
    const [c] = await testDb<{ id: string }>(
      `INSERT INTO containers (container_code, waste_record_id, seq_no, status) VALUES ($1, $2, $3, $4::container_status) RETURNING id`,
      [codes[i], w.id, i + 1, inProgress ? "SCANNED_AT_PICKUP" : "LABELLED"]
    );
    containerIds.push(c.id);
  }

  let tripId: string | null = null;
  let stopId: string | null = null;
  const tripCode = `TR-99${digits(4)}-${digits(2)}`;
  if (opts.trip) {
    const [t] = await testDb<{ id: string }>(
      `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
       VALUES ($1, $2, $3, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, $4::trip_status, CASE WHEN $5::boolean THEN now() END)
       RETURNING id`,
      [tripCode, v.id, d.id, opts.trip, inProgress]
    );
    tripId = t.id;
    const [s] = await testDb<{ id: string }>(
      `INSERT INTO trip_stops (trip_id, facility_id, priority_order, status, arrived_at)
       VALUES ($1, $2, 1, $3::stop_status, CASE WHEN $4::boolean THEN now() END) RETURNING id`,
      [t.id, f.id, inProgress ? "ARRIVED" : "PENDING", inProgress]
    );
    stopId = s.id;
    await testDb(`INSERT INTO trip_stop_waste (trip_stop_id, waste_record_id) VALUES ($1, $2)`, [
      s.id,
      w.id,
    ]);
    if (inProgress) {
      for (const cid of containerIds) {
        await testDb(
          `INSERT INTO handovers (trip_stop_id, container_id, driver_id) VALUES ($1, $2, $3)`,
          [s.id, cid, d.id]
        );
      }
    }
  }
  return { facilityName: name, phone, codes, hospitalId, driverId, tripId, tripCode, stopId };
}

/** The pickup code as the SMS gateway would read it (encrypted in the outbox until sent). */
async function smsCode(phone: string): Promise<string> {
  const [m] = await testDb<{ payload: { sealed: string } }>(
    `SELECT payload FROM outbox_messages WHERE template = 'otp.pickup' AND recipient = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return unseal(m.payload.sealed, OUTBOX_KEY).code;
}

test.describe("pickup (Gate 3.12)", () => {
  test("driver: start trip → arrive → scan every container → wrong code refused → right code completes", async ({
    page,
  }) => {
    const w = await world({ containers: 2, trip: "PLANNED" });
    await asIdentity(page, w.driverId, "driver");
    await page.goto("/driver");
    await page.getByRole("button", { name: `Start trip ${w.tripCode}` }).click();

    const card = page.locator("article", { hasText: w.facilityName });
    await card.getByRole("button", { name: "I have arrived" }).click();
    await expect(card.getByText("1. Scan every container")).toBeVisible();
    for (let i = 0; i < w.codes.length; i++) {
      await card.getByLabel("Container code").fill(w.codes[i]);
      await card.getByRole("button", { name: "Scan", exact: true }).click();
      await expect(card.getByText(`Scanned (${i + 1} of ${w.codes.length})`)).toBeVisible();
    }

    const code = await smsCode(w.phone);
    await card
      .getByLabel("2. Pickup code from the hospital")
      .fill(code === "000000" ? "111111" : "000000");
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(card.getByText(/Wrong code\. \d attempt\(s\) left\./)).toBeVisible();

    await card.getByLabel("2. Pickup code from the hospital").fill(code);
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.locator("article", { hasText: w.facilityName }).getByText("Handover confirmed (OTP)")
    ).toBeVisible();
    const [s] = await testDb<{ status: string; collection_method: string }>(
      `SELECT status, collection_method FROM trip_stops WHERE id = $1`,
      [w.stopId]
    );
    expect(s).toEqual({ status: "COLLECTED", collection_method: "OTP" });
  });

  test("API: double tap is one action; missing key 400; EFDA 403; scans required; skip releases", async ({
    page,
  }) => {
    const w = await world({ containers: 1, trip: "PLANNED" });
    await asIdentity(page, w.driverId, "driver");
    const post = (path: string, data: unknown, key?: string) =>
      page.request.post(path, { headers: key ? { "Idempotency-Key": key } : {}, data });

    const start = await post(`/api/trips/${w.tripId}/start`, {}, randomUUID());
    expect(start.status(), await start.text()).toBe(200);
    expect((await post(`/api/stops/${w.stopId}/arrive`, {})).status()).toBe(400); // no Idempotency-Key
    const key = randomUUID();
    const a = await post(`/api/stops/${w.stopId}/arrive`, {}, key);
    const b = await post(`/api/stops/${w.stopId}/arrive`, {}, key); // the same tap again
    expect(a.status(), await a.text()).toBe(200);
    expect(await b.json()).toEqual(await a.json());
    expect(
      await testDb(`SELECT id FROM otp_codes WHERE trip_stop_id = $1`, [w.stopId])
    ).toHaveLength(1);

    const verify = await post(
      `/api/stops/${w.stopId}/verify-otp`,
      { code: await smsCode(w.phone) },
      randomUUID()
    );
    expect(verify.status()).toBe(409);
    expect((await verify.json()).error.code).toBe("INCOMPLETE_SCAN");

    await asRole(page, "efda_officer");
    const scan = await post(
      `/api/stops/${w.stopId}/scan`,
      { containerCode: w.codes[0] },
      randomUUID()
    );
    expect(scan.status()).toBe(403);

    await asIdentity(page, w.driverId, "driver");
    const skip = await post(`/api/stops/${w.stopId}/skip`, { reason: "Gate closed" }, randomUUID());
    expect(skip.status(), await skip.text()).toBe(200);
    const [waste] = await testDb<{ status: string }>(
      `SELECT w.status FROM waste_records w JOIN trip_stop_waste l ON l.waste_record_id = w.id WHERE l.trip_stop_id = $1`,
      [w.stopId]
    );
    expect(waste.status).toBe("REGISTERED");
  });

  test("hospital: the truck at the door can be confirmed in the app when every container is scanned", async ({
    page,
  }) => {
    const w = await world({ containers: 2, trip: "IN_PROGRESS" });
    await asIdentity(page, w.hospitalId, "hospital_admin");
    await page.goto("/hospital");
    const card = page.locator("article", { hasText: w.tripCode });
    await expect(card.getByText("Truck at the door")).toBeVisible();
    await expect(card.getByText("2 of 2")).toBeVisible();
    await card.getByRole("button", { name: "Confirm handover in the app" }).click();
    await expect(page.getByText("Handover confirmed. The waste is now in transit.")).toBeVisible();
    const [s] = await testDb<{ status: string; collection_method: string }>(
      `SELECT status, collection_method FROM trip_stops WHERE id = $1`,
      [w.stopId]
    );
    expect(s).toEqual({ status: "COLLECTED", collection_method: "IN_APP" });
  });

  test("admin screens for Gate 3 render", async ({ page }) => {
    await asRole(page, "super_admin");
    for (const [path, text] of [
      ["/admin/trips", "Plan a trip"],
      ["/admin/trips/new", "Waiting list (oldest first)"],
      ["/admin/facilities", "Pickup readiness"],
      ["/admin/users", "Users"],
      ["/admin/fleet/manage", "GPS trackers"],
    ] as const) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.getByText(text).first(), path).toBeVisible();
    }
    const w = await world({ containers: 1 });
    await asIdentity(page, w.hospitalId, "hospital_admin");
    await page.goto("/hospital/users");
    await expect(page.getByText(/receive pickup codes/).first()).toBeVisible();
  });
});
