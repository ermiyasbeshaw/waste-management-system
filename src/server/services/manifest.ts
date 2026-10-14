import "server-only";
import { sql } from "drizzle-orm";
import { formatDate, formatDateTime } from "@/lib/dates";
import { writeAudit } from "@/server/audit/writer";
import { requireRole } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { renderManifest } from "@/server/integrations/pdf/manifest";
import { getSetting } from "@/server/services/settings";
import { inWorkflow } from "@/server/workflow/engine";

/**
 * Trip manifest PDF (CLAUDE.md §6): super_admin for any trip; a driver only for a trip CURRENTLY assigned to them
 * (another trip → 404, no existence leak). Rendered outside any transaction; every download is audited.
 */
export async function getTripManifestPdf(tripId: string, requestId?: string) {
  const user = await requireRole("super_admin", "driver");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
    throw new AppError("NOT_FOUND", 404, "Trip not found.");
  }
  const scope =
    user.role === "driver"
      ? sql`AND t.driver_id = (SELECT id FROM drivers WHERE user_id = ${user.id})`
      : sql``;
  const [trip] = (
    await db.execute(sql`
      SELECT t.id, t.trip_code, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date, v.plate_no,
             u.full_name AS driver_name, d.license_no
      FROM trips t JOIN vehicles v ON v.id = t.vehicle_id JOIN drivers d ON d.id = t.driver_id
      JOIN users u ON u.id = d.user_id
      WHERE t.id = ${tripId} ${scope} LIMIT 1`)
  ).rows as {
    id: string;
    trip_code: string;
    planned_date: string;
    plate_no: string;
    driver_name: string;
    license_no: string;
  }[];
  if (!trip) throw new AppError("NOT_FOUND", 404, "Trip not found.");

  const rows = (
    await db.execute(sql`
      SELECT s.priority_order, s.status, f.name, f.code, f.address, w.waste_code, c.name AS category_name,
             w.container_count, w.weight_kg,
             (SELECT array_agg(ct.container_code ORDER BY ct.seq_no) FROM containers ct WHERE ct.waste_record_id = w.id) AS codes
      FROM trip_stops s JOIN facilities f ON f.id = s.facility_id
      LEFT JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND (l.active OR s.status = 'SKIPPED')
      LEFT JOIN waste_records w ON w.id = l.waste_record_id
      LEFT JOIN waste_categories c ON c.id = w.category_id
      WHERE s.trip_id = ${tripId}
      ORDER BY s.priority_order, w.waste_code
      LIMIT 500`)
  ).rows as {
    priority_order: number;
    status: string;
    name: string;
    code: string;
    address: string;
    waste_code: string | null;
    category_name: string | null;
    container_count: number | null;
    weight_kg: string | null;
    codes: string[] | null;
  }[];

  const stops = new Map<number, Parameters<typeof renderManifest>[0]["stops"][number]>();
  for (const r of rows) {
    if (!stops.has(r.priority_order)) {
      stops.set(r.priority_order, {
        order: r.priority_order,
        facilityName: r.name,
        facilityCode: r.code,
        address: r.address,
        status: r.status,
        waste: [],
      });
    }
    if (r.waste_code) {
      stops.get(r.priority_order)!.waste.push({
        wasteCode: r.waste_code,
        categoryName: r.category_name ?? "",
        containerCount: r.container_count ?? 0,
        weightKg: Number(r.weight_kg ?? 0),
        containerCodes: r.codes ?? [],
      });
    }
  }

  const pdf = await renderManifest({
    systemName: await getSetting("system_name"),
    tripCode: trip.trip_code,
    plannedDate: formatDate(trip.planned_date),
    vehiclePlate: trip.plate_no,
    driverName: trip.driver_name,
    driverLicenceNo: trip.license_no,
    printedAt: formatDateTime(new Date()),
    stops: Array.from(stops.values()),
  });
  await inWorkflow((tx) =>
    writeAudit(tx, {
      actor: { userId: user.id, role: user.role },
      action: "trip.manifest_printed",
      entityType: "trip",
      entityId: trip.id,
      after: { tripCode: trip.trip_code },
      requestId,
    })
  );
  return { tripCode: trip.trip_code, pdf };
}
