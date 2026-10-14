import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import type { CollectionMethod, StopStatus, TripStatus } from "@/lib/statuses";
import { requireRole } from "@/server/auth/current-user";
import type { DriverDashboardData, DriverTrip, StopCard } from "@/types/view-models";
import { MOH_HEX, num, round2, rows } from "./_shared";

/**
 * Driver console (CLAUDE.md §3): the signed-in driver's OWN trips only — `trips.driver_id` is the driver profile
 * of the user in the session, inside SQL. Read-only here; driver actions (arrive, scan, OTP) come in Gate 3 and
 * are authorized against the current assignment inside their transaction. Three queries in total (no N+1).
 */
export const getDriverDashboard = cache(async (): Promise<DriverDashboardData | null> => {
  const user = await requireRole("driver");

  const [profile] = await rows<{
    id: string;
    name: string;
    license_no: string;
    plate: string | null;
  }>(sql`
    SELECT d.id, u.full_name AS name, d.license_no, v.plate_no AS plate
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN vehicles v ON v.id = d.default_vehicle_id
    WHERE d.user_id = ${user.id}
    LIMIT 1`);
  if (!profile) return null;

  const trips = await rows<{
    id: string;
    trip_code: string;
    planned_date: string;
    status: TripStatus;
    plate_no: string;
    started_at: Date | null;
  }>(sql`
    SELECT t.id, t.trip_code, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date, t.status, v.plate_no,
           t.started_at
    FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.driver_id = ${profile.id} AND t.status IN ('IN_PROGRESS', 'PLANNED')
    ORDER BY (t.status = 'IN_PROGRESS') DESC, t.planned_date, t.trip_code
    LIMIT 20`);

  const tripIds = trips.map((t) => t.id);
  const inTrips = tripIds.length
    ? sql`s.trip_id IN (${sql.join(
        tripIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    : sql`FALSE`;

  const [stops, categories] = await Promise.all([
    rows<{
      id: string;
      trip_id: string;
      priority_order: number;
      status: StopStatus;
      arrived_at: Date | null;
      collection_method: CollectionMethod | null;
      facility_id: string;
      code: string;
      name: string;
      address: string;
      containers: string;
      kg: string;
      scanned: string;
      otp_expires_at: Date | null;
    }>(sql`
      SELECT s.id, s.trip_id, s.priority_order, s.status, s.arrived_at, s.collection_method,
             f.id AS facility_id, f.code, f.name, f.address,
             coalesce(sum(w.container_count), 0) AS containers, coalesce(sum(w.weight_kg), 0) AS kg,
             (SELECT count(*) FROM handovers h WHERE h.trip_stop_id = s.id AND h.status = 'SCANNED') AS scanned,
             (SELECT o.expires_at FROM otp_codes o WHERE o.trip_stop_id = s.id AND o.status = 'ISSUED'
                AND o.expires_at > now() LIMIT 1) AS otp_expires_at
      FROM trip_stops s
      JOIN facilities f ON f.id = s.facility_id
      LEFT JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
      LEFT JOIN waste_records w ON w.id = l.waste_record_id
      WHERE ${inTrips}
      GROUP BY s.id, f.id
      ORDER BY s.priority_order
      LIMIT 200`),
    rows<{ stop_id: string; name: string; colour_code: string; count: string }>(sql`
      SELECT s.id AS stop_id, c.name, c.colour_code, sum(w.container_count) AS count
      FROM trip_stops s
      JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
      JOIN waste_records w ON w.id = l.waste_record_id
      JOIN waste_categories c ON c.id = w.category_id
      WHERE ${inTrips}
      GROUP BY s.id, c.id
      ORDER BY c.name
      LIMIT 500`),
  ]);

  const toStop = (s: (typeof stops)[number]): StopCard => ({
    id: s.id,
    order: s.priority_order,
    facility: { id: s.facility_id, code: s.code, name: s.name, address: s.address },
    status: s.status,
    expectedContainers: num(s.containers),
    weightKg: round2(s.kg),
    categories: categories
      .filter((c) => c.stop_id === s.id)
      .map((c) => ({
        name: c.name,
        colourHex: MOH_HEX[c.colour_code] ?? "#71717a",
        count: num(c.count),
      })),
    arrivedAt: s.arrived_at ? new Date(s.arrived_at).toISOString() : null,
    collectionMethod: s.collection_method,
    scannedContainers: num(s.scanned),
    otpExpiresAt: s.otp_expires_at ? new Date(s.otp_expires_at).toISOString() : null,
  });

  const toTrip = (t: (typeof trips)[number]): DriverTrip => {
    const own = stops.filter((s) => s.trip_id === t.id).map(toStop);
    return {
      id: t.id,
      tripCode: t.trip_code,
      plannedDate: t.planned_date,
      status: t.status,
      vehiclePlate: t.plate_no,
      stopsCompleted: own.filter((s) =>
        ["COLLECTED", "COLLECTED_OVERRIDE", "SKIPPED"].includes(s.status)
      ).length,
      stopsTotal: own.length,
      containersTotal: own.reduce((n, s) => n + s.expectedContainers, 0),
      weightKgTotal: round2(own.reduce((n, s) => n + s.weightKg, 0)),
      startedAt: t.started_at ? new Date(t.started_at).toISOString() : null,
      stops: own,
    };
  };

  const active = trips.find((t) => t.status === "IN_PROGRESS");
  return {
    driver: {
      id: profile.id,
      name: profile.name,
      licenseNo: profile.license_no,
      vehiclePlate: profile.plate,
    },
    activeTrip: active ? toTrip(active) : null,
    upcomingTrips: trips.filter((t) => t.status === "PLANNED").map(toTrip),
  };
});
