import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import type { ContainerStatus, TripStatus } from "@/lib/statuses";
import { requireRole } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import type { DisposalDashboardData, DisposalWork } from "@/types/view-models";
import type { MohColor } from "@/types/waste";
import { MOH_HEX, MAX_PAGE, num, round2, rows } from "./_shared";

/**
 * Disposal operator console (CLAUDE.md §3; DECISION v1.2 addendum: the operator belongs to the DISPOSAL_SITE).
 * Reads only; receipt, exceptions and destruction are commands (src/server/services/disposal.ts). Lists are
 * bounded (LIMIT) and cached per request, so the layout and the page share one set of queries.
 * ASSUMPTION: one disposal site (pilot scale, CLAUDE.md §1) — every trip delivers to it.
 */
/** The operator's disposal site (403 when the account is not linked to the DISPOSAL_SITE). */
const requireSite = cache(async (): Promise<{ name: string }> => {
  const user = await requireRole("disposal_operator");
  if (!user.facilityId)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to the disposal site.");
  const [site] = await rows<{ name: string }>(sql`
    SELECT name FROM facilities WHERE id = ${user.facilityId} AND type = 'DISPOSAL_SITE' LIMIT 1`);
  if (!site)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to the disposal site.");
  return site;
});

export const getDisposalDashboard = cache(async (): Promise<DisposalDashboardData> => {
  const site = await requireSite();

  const [[stats], inbound, queue, exceptions] = await Promise.all([
    rows<Record<string, string>>(sql`
      SELECT
        (SELECT count(*) FROM trips WHERE status = 'IN_PROGRESS') AS inbound,
        (SELECT count(*) FROM containers WHERE status = 'RECEIVED') AS queue,
        (SELECT count(*) FROM containers c JOIN disposal_records d ON d.waste_record_id = c.waste_record_id
           WHERE c.status = 'DESTROYED'
             AND (d.destroyed_at AT TIME ZONE 'Africa/Addis_Ababa')::date
               = (now() AT TIME ZONE 'Africa/Addis_Ababa')::date) AS destroyed_today,
        (SELECT coalesce(sum(w.weight_kg), 0) FROM waste_records w JOIN disposal_records d ON d.waste_record_id = w.id
           WHERE d.destroyed_at IS NOT NULL
             AND (d.destroyed_at AT TIME ZONE 'Africa/Addis_Ababa')::date
               = (now() AT TIME ZONE 'Africa/Addis_Ababa')::date) AS destroyed_today_kg,
        (SELECT count(*) FROM containers WHERE status = 'MISSING'
           AND updated_at >= now() - interval '30 days') AS missing,
        (SELECT count(*) FROM containers WHERE status = 'REFUSED'
           AND updated_at >= now() - interval '30 days') AS refused`),
    rows<{
      id: string;
      trip_code: string;
      plate_no: string;
      status: TripStatus;
      driver_name: string;
      containers: string;
      kg: string;
    }>(sql`
      SELECT t.id, t.trip_code, v.plate_no, t.status, u.full_name AS driver_name,
             (SELECT count(*) FROM trip_stops s
                JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
                JOIN containers c ON c.waste_record_id = l.waste_record_id
              WHERE s.trip_id = t.id AND c.status = 'COLLECTED') AS containers,
             (SELECT coalesce(sum(w.weight_kg), 0) FROM trip_stops s
                JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
                JOIN waste_records w ON w.id = l.waste_record_id
              WHERE s.trip_id = t.id AND w.status = 'IN_TRANSIT') AS kg
      FROM trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      JOIN drivers d ON d.id = t.driver_id
      JOIN users u ON u.id = d.user_id
      WHERE t.status = 'IN_PROGRESS'
      ORDER BY t.started_at
      LIMIT 20`),
    rows<{
      id: string;
      container_code: string;
      status: ContainerStatus;
      waste_code: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      category_code: string;
      category_name: string;
      colour_code: MohColor;
      received_at: Date | null;
    }>(sql`
      SELECT c.id, c.container_code, c.status, w.waste_code, f.id AS facility_id, f.code AS facility_code,
             f.name AS facility_name, cat.code AS category_code, cat.name AS category_name, cat.colour_code,
             d.received_at
      FROM containers c
      JOIN waste_records w ON w.id = c.waste_record_id
      JOIN facilities f ON f.id = w.facility_id
      JOIN waste_categories cat ON cat.id = w.category_id
      LEFT JOIN disposal_records d ON d.waste_record_id = w.id
      WHERE c.status = 'RECEIVED'
      ORDER BY d.received_at NULLS LAST, c.container_code
      LIMIT ${MAX_PAGE}`),
    rows<{
      id: string;
      container_code: string;
      status: ContainerStatus;
      reason: string | null;
      at: Date;
      facility_id: string;
      facility_code: string;
      facility_name: string;
    }>(sql`
      SELECT c.id, c.container_code, c.status, c.exception_reason AS reason, c.updated_at AS at,
             f.id AS facility_id, f.code AS facility_code, f.name AS facility_name
      FROM containers c
      JOIN waste_records w ON w.id = c.waste_record_id
      JOIN facilities f ON f.id = w.facility_id
      WHERE c.status IN ('MISSING', 'REFUSED') AND c.updated_at >= now() - interval '30 days'
      ORDER BY c.updated_at DESC
      LIMIT ${MAX_PAGE}`),
  ]);

  const missing = num(stats.missing);
  const refused = num(stats.refused);
  return {
    siteName: site.name,
    stats: {
      inboundCount: num(stats.inbound),
      queueCount: num(stats.queue),
      destroyedTodayCount: num(stats.destroyed_today),
      destroyedTodayKg: round2(stats.destroyed_today_kg),
      missingCount: missing,
      refusedCount: refused,
      exceptionsCount: missing + refused,
    },
    inbound: inbound.map((t) => ({
      id: t.id,
      tripCode: t.trip_code,
      vehiclePlate: t.plate_no,
      status: t.status,
      driverName: t.driver_name,
      weightKgTotal: round2(t.kg),
      containersTotal: num(t.containers),
    })),
    queue: queue.map((c) => ({
      id: c.id,
      containerCode: c.container_code,
      facility: { id: c.facility_id, code: c.facility_code, name: c.facility_name },
      category: {
        code: c.category_code,
        name: c.category_name,
        colourCode: c.colour_code,
        colourHex: MOH_HEX[c.colour_code] ?? "#71717a",
      },
      status: c.status,
      receivedAt: c.received_at ? new Date(c.received_at).toISOString() : null,
      wasteCode: c.waste_code,
    })),
    exceptions: exceptions.map((c) => ({
      id: c.id,
      containerCode: c.container_code,
      facility: { id: c.facility_id, code: c.facility_code, name: c.facility_name },
      status: c.status,
      reason: c.reason,
      at: new Date(c.at).toISOString(),
    })),
  };
});

/** Work lists of the site (Gate 5): containers to check in, waste to destroy or close, destruction methods. */
export const getDisposalWork = cache(async (): Promise<DisposalWork> => {
  await requireSite();
  const [onBoard, ready, methods] = await Promise.all([
    rows<{
      container_code: string;
      waste_code: string;
      facility_name: string;
      trip_code: string;
      plate_no: string;
    }>(sql`
      SELECT c.container_code, w.waste_code, f.name AS facility_name, t.trip_code, v.plate_no
      FROM containers c
      JOIN waste_records w ON w.id = c.waste_record_id
      JOIN facilities f ON f.id = w.facility_id
      JOIN trip_stop_waste l ON l.waste_record_id = w.id AND l.active
      JOIN trip_stops s ON s.id = l.trip_stop_id AND s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE')
      JOIN trips t ON t.id = s.trip_id
      JOIN vehicles v ON v.id = t.vehicle_id
      WHERE c.status = 'COLLECTED'
      ORDER BY t.started_at DESC, t.trip_code, c.container_code
      LIMIT ${MAX_PAGE}`),
    rows<{
      id: string;
      waste_code: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      category_name: string;
      weight_kg: string;
      received: string;
      exceptions: string;
    }>(sql`
      SELECT w.id, w.waste_code, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name,
             cat.name AS category_name, w.weight_kg,
             count(*) FILTER (WHERE c.status = 'RECEIVED') AS received,
             count(*) FILTER (WHERE c.status IN ('MISSING', 'REFUSED')) AS exceptions
      FROM waste_records w
      JOIN facilities f ON f.id = w.facility_id
      JOIN waste_categories cat ON cat.id = w.category_id
      JOIN containers c ON c.waste_record_id = w.id
      WHERE w.status = 'RECEIVED'
      GROUP BY w.id, f.id, cat.id
      ORDER BY w.waste_code
      LIMIT ${MAX_PAGE}`),
    rows<{ code: string; name: string }>(sql`
      SELECT code, name FROM destruction_methods WHERE active ORDER BY name LIMIT 20`),
  ]);
  return {
    onBoard: onBoard.map((c) => ({
      containerCode: c.container_code,
      wasteCode: c.waste_code,
      facilityName: c.facility_name,
      tripCode: c.trip_code,
      vehiclePlate: c.plate_no,
    })),
    ready: ready.map((w) => ({
      id: w.id,
      wasteCode: w.waste_code,
      facility: { id: w.facility_id, code: w.facility_code, name: w.facility_name },
      categoryName: w.category_name,
      weightKg: round2(w.weight_kg),
      receivedCount: num(w.received),
      exceptionCount: num(w.exceptions),
    })),
    methods,
  };
});
