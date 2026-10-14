import "server-only";
import { sql } from "drizzle-orm";
import type { GpsPoint } from "@/lib/validation/tracking";
import { AppError } from "@/server/errors";
import { inWorkflow } from "@/server/workflow/engine";
import { authenticateTracker, markTrackerSeen } from "./fleet";
import { getSetting } from "./settings";

/**
 * GPS ingest (CLAUDE.md §6, Gate 4.1 / 4.3). Points arrive from vehicle trackers (never from the driver app),
 * authenticated per device. Rules:
 * - duplicates are ignored via the unique (device_id, recorded_at);
 * - points more than `tracker_max_clock_skew_minutes` in the future are rejected;
 * - each point is linked to the vehicle's trip whose time window contains it (started … completed/cancelled, or
 *   still in progress); points outside any trip are kept without a trip;
 * - the tracker's `last_seen_at` moves forward (silent-tracker alert).
 * GPS points are evidence data, not status changes: they are not written to the audit log (one row per point would
 * flood it); the arrival evidence (distance, geofence flag) is audited with the stop.
 */

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: { index: number; reason: "FUTURE_TIMESTAMP" }[];
}

export async function ingestGpsPoints(
  deviceId: string,
  token: string,
  points: GpsPoint[],
  now = new Date()
): Promise<IngestResult> {
  return inWorkflow(async (tx) => {
    const tracker = await authenticateTracker(tx, deviceId, token);
    if (!tracker.vehicleId) {
      throw new AppError("TRACKER_NOT_ASSIGNED", 409, "This tracker is not fitted to a vehicle.");
    }
    const skewMinutes = await getSetting("tracker_max_clock_skew_minutes", tx);
    const latest = now.getTime() + skewMinutes * 60_000;

    const rejected: IngestResult["rejected"] = [];
    const valid: GpsPoint[] = [];
    points.forEach((p, index) => {
      if (Date.parse(p.recordedAt) > latest) rejected.push({ index, reason: "FUTURE_TIMESTAMP" });
      else valid.push(p);
    });
    if (valid.length === 0) return { accepted: 0, duplicates: 0, rejected };

    const payload = JSON.stringify(
      valid.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        speed_kmh: p.speedKmh ?? null,
        heading: p.heading ?? null,
        recorded_at: new Date(p.recordedAt).toISOString(),
      }))
    );
    const inserted = await tx.execute<{ recorded_at: string }>(sql`
      INSERT INTO gps_events (device_id, vehicle_id, trip_id, lat, lng, speed_kmh, heading, recorded_at)
      SELECT ${tracker.id}::uuid, ${tracker.vehicleId}::uuid,
             (SELECT t.id FROM trips t
               WHERE t.vehicle_id = ${tracker.vehicleId}::uuid
                 AND t.started_at IS NOT NULL AND t.started_at <= p.recorded_at
                 AND p.recorded_at <= coalesce(t.completed_at, t.cancelled_at, 'infinity'::timestamptz)
               ORDER BY t.started_at DESC LIMIT 1),
             p.lat, p.lng, p.speed_kmh, p.heading, p.recorded_at
      FROM jsonb_to_recordset(${payload}::jsonb)
           AS p(lat double precision, lng double precision, speed_kmh real, heading real, recorded_at timestamptz)
      ON CONFLICT ON CONSTRAINT gps_events_device_recorded_unique DO NOTHING
      RETURNING recorded_at`);

    const accepted = inserted.rows.length;
    if (accepted > 0) {
      const newest = inserted.rows.reduce(
        (max, r) => Math.max(max, new Date(r.recorded_at).getTime()),
        0
      );
      await markTrackerSeen(tx, tracker.id, new Date(Math.min(newest, now.getTime())));
    }
    return { accepted, duplicates: valid.length - accepted, rejected };
  });
}
