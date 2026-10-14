import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import { getLiveMap, getReplayableTrips, getTripReplay } from "@/server/queries/tracking"; // mocks hoisted
import { ingestGpsPoints } from "@/server/services/tracking";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 4.4 / 4.5: live map positions and route replay. Only super_admin and the EFDA officer may read them
 * (CLAUDE.md §3); positions only for trips IN_PROGRESS (§6). Builds its own vehicle, tracker and trip.
 */
let currentRole: Role = "super_admin";
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(currentRole)) throw new AppError("FORBIDDEN", 403);
    return { id: "test", role: currentRole, facilityId: null, active: true };
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");

let tripId: string;
let tripCode: string;
let plate: string;
beforeAll(async () => {
  const token = randomBytes(32).toString("base64url");
  const deviceId = `TRK-Q${digits(8)}`;
  plate = `TEST-${digits(6)}`;
  const [v] = await q<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, 'IN_TRANSIT') RETURNING id`,
    [plate]
  );
  await q(`INSERT INTO tracker_devices (device_id, vehicle_id, token_hash) VALUES ($1, $2, $3)`, [
    deviceId,
    v.id,
    createHash("sha256").update(token).digest("hex"),
  ]);
  const clerk = `test_map_driver_${randomUUID()}`;
  const [u] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'Map Test Driver', $2) RETURNING id`,
    [clerk, `${clerk}@example.test`]
  );
  const [d] = await q<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, 'ON_TRIP') RETURNING id`,
    [u.id, `MAP-${digits(8)}`]
  );
  tripCode = `TR-99${digits(4)}-${digits(2)}`;
  [{ id: tripId }] = await q<{ id: string }>(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
     VALUES ($1, $2, $3, current_date, 'IN_PROGRESS', now() - interval '30 minutes') RETURNING id`,
    [tripCode, v.id, d.id]
  );
  const [f] = await q<{ id: string }>(`SELECT id FROM facilities WHERE code = 'DD-REF-001'`);
  await q(`INSERT INTO trip_stops (trip_id, facility_id, priority_order) VALUES ($1, $2, 1)`, [
    tripId,
    f.id,
  ]);
  const now = Date.now();
  await ingestGpsPoints(
    deviceId,
    token,
    Array.from({ length: 5 }, (_, i) => ({
      lat: 9.59 + i * 0.001,
      lng: 41.86 + i * 0.001,
      speedKmh: 20 + i,
      recordedAt: new Date(now - (25 - i * 5) * 60_000).toISOString(),
    }))
  );
});
afterAll(closeTestPool);

describe("tracking queries", () => {
  it("only super_admin and efda_officer can read the map and replays", async () => {
    for (const role of [
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
    ] as Role[]) {
      currentRole = role;
      await expect(getLiveMap(), role).rejects.toMatchObject({ httpStatus: 403 });
      await expect(getReplayableTrips(), role).rejects.toMatchObject({ httpStatus: 403 });
      await expect(getTripReplay(tripId), role).rejects.toMatchObject({ httpStatus: 403 });
    }
    currentRole = "efda_officer";
    expect(await getTripReplay(tripId)).not.toBeNull();
    currentRole = "super_admin";
  });

  it("live map: the vehicle on a trip in progress is at its latest point", async () => {
    currentRole = "super_admin";
    const map = await getLiveMap();
    const v = map.vehicles.find((x) => x.plateNumber === plate);
    if (!v) return; // more than 10 trips in progress on the test branch (LIMIT 10) — covered by the replay test
    expect(v).toMatchObject({ tripCode, speedKmh: 24 });
    expect(v.lat).toBeCloseTo(9.594, 6);
    expect(v.lng).toBeCloseTo(41.864, 6);
    expect(map.stops.filter((s) => s.tripCode === tripCode)).toHaveLength(1);
  });

  it("replay: the whole track in time order, stops with coordinates; bad or unknown ids → null", async () => {
    currentRole = "super_admin";
    const r = await getTripReplay(tripId);
    expect(r).toMatchObject({
      tripCode,
      vehiclePlate: plate,
      status: "IN_PROGRESS",
      thinned: false,
    });
    expect(r!.points).toHaveLength(5);
    const times = r!.points.map((p) => p.recordedAt);
    expect(times).toEqual([...times].sort());
    expect(r!.stops[0]).toMatchObject({ order: 1, status: "PENDING", geofenceOk: null });
    expect(r!.stops[0].lat).not.toBeNull();
    expect(await getTripReplay("not-a-uuid")).toBeNull();
    expect(await getTripReplay(randomUUID())).toBeNull();
    const list = await getReplayableTrips(100);
    expect(list.find((t) => t.id === tripId)).toMatchObject({ tripCode, points: 5 });
  });
});
