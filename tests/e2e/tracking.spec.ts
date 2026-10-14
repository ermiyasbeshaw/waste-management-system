import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { asRole, testDb } from "./helpers";

/**
 * Gate 4: GPS ingest over HTTP (device token), live map and route replay through the real server. Builds its own
 * vehicle, tracker and trip in progress; the seeded demo data is not touched.
 */

const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");

async function truckOnTrip() {
  const token = randomBytes(32).toString("base64url");
  const deviceId = `TRK-E${digits(8)}`;
  const plate = `E2E-${digits(6)}`;
  const [v] = await testDb<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, 'IN_TRANSIT') RETURNING id`,
    [plate]
  );
  await testDb(
    `INSERT INTO tracker_devices (device_id, vehicle_id, token_hash) VALUES ($1, $2, $3)`,
    [deviceId, v.id, createHash("sha256").update(token).digest("hex")]
  );
  const clerk = `e2e_trk_${randomUUID().slice(0, 13)}`;
  const [u] = await testDb<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'E2E Map Driver', $2) RETURNING id`,
    [clerk, `${clerk}@example.test`]
  );
  const [d] = await testDb<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, 'ON_TRIP') RETURNING id`,
    [u.id, `E2E-${digits(8)}`]
  );
  const tripCode = `TR-99${digits(4)}-${digits(2)}`;
  const [t] = await testDb<{ id: string }>(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
     VALUES ($1, $2, $3, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'IN_PROGRESS', now() - interval '20 minutes')
     RETURNING id`,
    [tripCode, v.id, d.id]
  );
  return { token, deviceId, plate, tripId: t.id, tripCode };
}

test.describe("tracking (Gate 4)", () => {
  test("ingest: device token required; points stored once; future points rejected; replay returns the track", async ({
    page,
    request,
  }) => {
    const truck = await truckOnTrip();
    const now = Date.now();
    const points = [10, 5, 1].map((m, i) => ({
      lat: 9.595 + i * 0.002,
      lng: 41.855 + i * 0.002,
      speedKmh: 30,
      recordedAt: new Date(now - m * 60_000).toISOString(),
    }));
    const send = (body: unknown, token = truck.token) =>
      request.post("/api/tracking/v1/ingest", {
        headers: { "x-device-id": truck.deviceId, authorization: `Bearer ${token}` },
        data: body,
      });

    expect((await send({ points }, "w".repeat(43))).status()).toBe(401);
    const first = await send({ points });
    expect(first.status(), await first.text()).toBe(200);
    expect(await first.json()).toEqual({ accepted: 3, duplicates: 0, rejected: [] });
    expect(await (await send({ points })).json()).toMatchObject({ accepted: 0, duplicates: 3 });
    const future = await send({
      points: [{ lat: 9.6, lng: 41.86, recordedAt: new Date(now + 3_600_000).toISOString() }],
    });
    expect(await future.json()).toMatchObject({ accepted: 0, rejected: [{ index: 0 }] });
    expect((await send({ points: [{ lat: 99, lng: 0, recordedAt: "x" }] })).status()).toBe(422);

    await asRole(page, "efda_officer");
    const replay = await page.request.get(`/api/tracking/trips/${truck.tripId}`);
    expect(replay.status()).toBe(200);
    const body = await replay.json();
    expect(body.tripCode).toBe(truck.tripCode);
    expect(body.points).toHaveLength(3);

    await asRole(page, "hospital_admin");
    expect((await page.request.get("/api/tracking/live")).status()).toBe(403);
    expect((await page.request.get(`/api/tracking/trips/${truck.tripId}`)).status()).toBe(403);
  });

  test("regulator map page draws a real map and replays a trip", async ({ page }) => {
    const truck = await truckOnTrip();
    await page.request.post("/api/tracking/v1/ingest", {
      headers: { "x-device-id": truck.deviceId, authorization: `Bearer ${truck.token}` },
      data: {
        points: [{ lat: 9.6, lng: 41.86, speedKmh: 25, recordedAt: new Date().toISOString() }],
      },
    });
    await asRole(page, "efda_officer");
    await page.goto(`/regulator/map?trip=${truck.tripId}`);
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect(page.getByText("Route replay")).toBeVisible();
    await expect(page.getByLabel("Replay position")).toBeVisible();
    // The replay header shows the chosen trip (the picker's <option> with the same text is not "visible").
    await expect(
      page.locator("span", { hasText: new RegExp(`^${truck.tripCode}$`) }).first()
    ).toBeVisible();
  });

  test("admin fleet radar is a real map", async ({ page }) => {
    await asRole(page, "super_admin");
    await page.goto("/admin/fleet");
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
  });
});
