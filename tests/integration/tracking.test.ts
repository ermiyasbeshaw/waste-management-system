import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { ingestGpsPoints } from "@/server/services/tracking";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 4.1 / 4.3: GPS ingest on the Neon `test` branch (these commit). Each test builds its own vehicle, tracker
 * (known token, stored hashed like the fleet service does) and, where needed, a trip.
 */
// The ingest is called by a device, not a signed-in user; React's per-request `cache` is a pass-through here.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
afterAll(closeTestPool);

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
const minutesAgo = (m: number, from = Date.now()) => new Date(from - m * 60_000).toISOString();

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

/** A vehicle with a tracker; optionally a trip of that vehicle that started `startedMinutesAgo`. */
async function rig(
  opts: { vehicle?: boolean; active?: boolean; trip?: "IN_PROGRESS" | "COMPLETED" } = {}
) {
  const token = randomBytes(32).toString("base64url");
  const deviceId = `TRK-T${digits(8)}`;
  let vehicleId: string | null = null;
  if (opts.vehicle !== false) {
    [{ id: vehicleId }] = await q<{ id: string }>(
      `INSERT INTO vehicles (plate_no, capacity_kg) VALUES ($1, 2000) RETURNING id`,
      [`TEST-${digits(6)}`]
    );
  }
  const [tracker] = await q<{ id: string }>(
    `INSERT INTO tracker_devices (device_id, vehicle_id, token_hash, active) VALUES ($1, $2, $3, $4) RETURNING id`,
    [deviceId, vehicleId, createHash("sha256").update(token).digest("hex"), opts.active ?? true]
  );
  let tripId: string | null = null;
  if (opts.trip && vehicleId) {
    const clerk = `test_trk_driver_${randomUUID()}`;
    const [u] = await q<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'Tracking Test Driver', $2) RETURNING id`,
      [clerk, `${clerk}@example.test`]
    );
    const [d] = await q<{ id: string }>(
      `INSERT INTO drivers (user_id, license_no) VALUES ($1, $2) RETURNING id`,
      [u.id, `TRK-${digits(8)}`]
    );
    const completed = opts.trip === "COMPLETED";
    [{ id: tripId }] = await q<{ id: string }>(
      `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at, completed_at)
       VALUES ($1, $2, $3, current_date, $4::trip_status, now() - interval '60 minutes',
               CASE WHEN $5::boolean THEN now() - interval '20 minutes' END) RETURNING id`,
      [`TR-99${digits(4)}-${digits(2)}`, vehicleId, d.id, opts.trip, completed]
    );
  }
  return { token, deviceId, trackerId: tracker.id, vehicleId, tripId };
}

const point = (recordedAt: string, extra: Partial<{ speedKmh: number; heading: number }> = {}) => ({
  lat: 9.6 + Math.random() / 100,
  lng: 41.85 + Math.random() / 100,
  recordedAt,
  ...extra,
});

describe("GPS ingest (Gate 4.1)", () => {
  it("stores points, links them to the trip whose time window contains them, and moves last_seen_at", async () => {
    const r = await rig({ trip: "IN_PROGRESS" });
    const now = Date.now();
    const result = await ingestGpsPoints(r.deviceId, r.token, [
      point(minutesAgo(90, now)), // before the trip started → no trip
      point(minutesAgo(30, now), { speedKmh: 42, heading: 90 }),
      point(minutesAgo(1, now)),
    ]);
    expect(result).toEqual({ accepted: 3, duplicates: 0, rejected: [] });
    const rows = await q<{ trip_id: string | null; speed_kmh: number | null }>(
      `SELECT trip_id, speed_kmh FROM gps_events WHERE device_id = $1 ORDER BY recorded_at`,
      [r.trackerId]
    );
    expect(rows.map((x) => x.trip_id)).toEqual([null, r.tripId, r.tripId]);
    expect(rows[1].speed_kmh).toBe(42);
    const [t] = await q<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM tracker_devices WHERE id = $1`,
      [r.trackerId]
    );
    expect(
      Math.abs(new Date(t.last_seen_at).getTime() - Date.parse(minutesAgo(1, now)))
    ).toBeLessThan(1000);
  });

  it("a replay is ignored (duplicates by device + time), last_seen_at never moves back", async () => {
    const r = await rig({ trip: "IN_PROGRESS" });
    const pts = [point(minutesAgo(5)), point(minutesAgo(4))];
    expect(await ingestGpsPoints(r.deviceId, r.token, pts)).toMatchObject({ accepted: 2 });
    expect(await ingestGpsPoints(r.deviceId, r.token, pts)).toEqual({
      accepted: 0,
      duplicates: 2,
      rejected: [],
    });
    const before = await q<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM tracker_devices WHERE id = $1`,
      [r.trackerId]
    );
    await ingestGpsPoints(r.deviceId, r.token, [point(minutesAgo(50))]); // late, older point
    const after = await q<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM tracker_devices WHERE id = $1`,
      [r.trackerId]
    );
    expect(new Date(after[0].last_seen_at)).toEqual(new Date(before[0].last_seen_at));
    expect(await q(`SELECT id FROM gps_events WHERE device_id = $1`, [r.trackerId])).toHaveLength(
      3
    );
  });

  it("points too far in the future are rejected; within the allowed clock skew they are accepted", async () => {
    const r = await rig();
    const now = Date.now();
    const result = await ingestGpsPoints(r.deviceId, r.token, [
      point(new Date(now + 60 * 60_000).toISOString()), // 1 h ahead (setting: 5 min)
      point(new Date(now + 2 * 60_000).toISOString()), // 2 min ahead: allowed
    ]);
    expect(result).toEqual({
      accepted: 1,
      duplicates: 0,
      rejected: [{ index: 0, reason: "FUTURE_TIMESTAMP" }],
    });
  });

  it("points after the trip completed are not linked to it", async () => {
    const r = await rig({ trip: "COMPLETED" });
    await ingestGpsPoints(r.deviceId, r.token, [point(minutesAgo(30)), point(minutesAgo(5))]);
    const rows = await q<{ trip_id: string | null }>(
      `SELECT trip_id FROM gps_events WHERE device_id = $1 ORDER BY recorded_at`,
      [r.trackerId]
    );
    expect(rows.map((x) => x.trip_id)).toEqual([r.tripId, null]);
  });

  it("wrong token, unknown device and inactive tracker all get the same 401; no vehicle → 409", async () => {
    const r = await rig();
    const pts = [point(minutesAgo(1))];
    expect(await refusal(ingestGpsPoints(r.deviceId, "x".repeat(43), pts))).toBe(
      "401 UNAUTHENTICATED"
    );
    expect(await refusal(ingestGpsPoints("TRK-NOPE-000", r.token, pts))).toBe(
      "401 UNAUTHENTICATED"
    );
    const off = await rig({ active: false });
    expect(await refusal(ingestGpsPoints(off.deviceId, off.token, pts))).toBe(
      "401 UNAUTHENTICATED"
    );
    const loose = await rig({ vehicle: false });
    expect(await refusal(ingestGpsPoints(loose.deviceId, loose.token, pts))).toBe(
      "409 TRACKER_NOT_ASSIGNED"
    );
    expect(
      await q(`SELECT id FROM gps_events WHERE device_id = ANY($1::uuid[])`, [
        [r.trackerId, off.trackerId, loose.trackerId],
      ])
    ).toHaveLength(0);
  });
});
