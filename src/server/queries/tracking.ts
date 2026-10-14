import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import type { StopStatus, TripStatus } from "@/lib/statuses";
import { requireRole } from "@/server/auth/current-user";
import type { MapData, ReplayableTrip, TripReplay } from "@/types/view-models";
import { loadActiveTripMap, num, rows } from "./_shared";

/**
 * Tracking reads (CLAUDE.md §3: super_admin fleet radar; efda_officer route replay, read-only; §6: positions only
 * for trips IN_PROGRESS). Hospitals, drivers and the disposal operator have no map access.
 */

const MAP_ROLES = ["super_admin", "efda_officer"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ASSUMPTION: a replay shows at most 2 000 points; longer tracks are thinned evenly (start and end kept). */
export const MAX_REPLAY_POINTS = 2000;

/** Live positions of vehicles on trips in progress (polled every 30 s by the map). */
export const getLiveMap = cache(async (): Promise<MapData> => {
  await requireRole(...MAP_ROLES);
  return loadActiveTripMap();
});

/** Trips that have started (newest first), with their number of stored GPS points. */
export const getReplayableTrips = cache(async (limit = 20): Promise<ReplayableTrip[]> => {
  await requireRole(...MAP_ROLES);
  const result = await rows<{
    id: string;
    trip_code: string;
    status: TripStatus;
    planned_date: string;
    plate_no: string;
    points: string;
  }>(sql`
    SELECT t.id, t.trip_code, t.status, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date, v.plate_no,
           (SELECT count(*) FROM gps_events g WHERE g.trip_id = t.id) AS points
    FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.started_at IS NOT NULL
    ORDER BY t.started_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)}`);
  return result.map((t) => ({
    id: t.id,
    tripCode: t.trip_code,
    status: t.status,
    plannedDate: t.planned_date,
    vehiclePlate: t.plate_no,
    points: num(t.points),
  }));
});

/** The stored GPS track of one trip plus its stops and arrival evidence. null = not found or not started. */
export const getTripReplay = cache(async (tripId: string): Promise<TripReplay | null> => {
  await requireRole(...MAP_ROLES);
  if (!UUID_RE.test(tripId)) return null;
  const [trip] = await rows<{
    id: string;
    trip_code: string;
    status: TripStatus;
    plate_no: string;
    driver_name: string;
    started_at: Date | null;
    ended_at: Date | null;
    total: string;
  }>(sql`
    SELECT t.id, t.trip_code, t.status, v.plate_no, u.full_name AS driver_name, t.started_at,
           coalesce(t.completed_at, t.cancelled_at) AS ended_at,
           (SELECT count(*) FROM gps_events g WHERE g.trip_id = t.id) AS total
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
    JOIN users u ON u.id = d.user_id
    WHERE t.id = ${tripId} AND t.started_at IS NOT NULL
    LIMIT 1`);
  if (!trip) return null;

  const total = num(trip.total);
  const step = Math.max(1, Math.ceil(total / MAX_REPLAY_POINTS));
  const [points, stops] = await Promise.all([
    rows<{ lat: number; lng: number; speed_kmh: number | null; recorded_at: Date }>(sql`
      SELECT lat, lng, speed_kmh, recorded_at FROM (
        SELECT lat, lng, speed_kmh, recorded_at,
               row_number() OVER (ORDER BY recorded_at) AS rn
        FROM gps_events WHERE trip_id = ${tripId}
      ) x
      WHERE (rn - 1) % ${step} = 0 OR rn = ${total}
      ORDER BY recorded_at
      LIMIT ${MAX_REPLAY_POINTS + 1}`),
    rows<{
      priority_order: number;
      name: string;
      lat: number | null;
      lng: number | null;
      status: StopStatus;
      arrived_at: Date | null;
      arrival_distance_m: number | null;
      geofence_ok: boolean | null;
    }>(sql`
      SELECT s.priority_order, f.name, f.lat, f.lng, s.status, s.arrived_at, s.arrival_distance_m, s.geofence_ok
      FROM trip_stops s JOIN facilities f ON f.id = s.facility_id
      WHERE s.trip_id = ${tripId}
      ORDER BY s.priority_order
      LIMIT 50`),
  ]);

  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    id: trip.id,
    tripCode: trip.trip_code,
    status: trip.status,
    vehiclePlate: trip.plate_no,
    driverName: trip.driver_name,
    startedAt: iso(trip.started_at),
    endedAt: iso(trip.ended_at),
    thinned: step > 1,
    points: points.map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      speedKmh: p.speed_kmh === null ? null : Math.round(Number(p.speed_kmh)),
      recordedAt: new Date(p.recorded_at).toISOString(),
    })),
    stops: stops.map((s) => ({
      order: s.priority_order,
      facilityName: s.name,
      lat: s.lat === null ? null : Number(s.lat),
      lng: s.lng === null ? null : Number(s.lng),
      status: s.status,
      arrivedAt: iso(s.arrived_at),
      arrivalDistanceM: s.arrival_distance_m,
      geofenceOk: s.geofence_ok,
    })),
  };
});
