import "server-only";
import { cache } from "react";
import { sql, type SQL } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import { requireRole } from "@/server/auth/current-user";
import type {
  AuditRow,
  CategoryRef,
  CertificateRow,
  FacilityRef,
  FacilityVolume,
  MapData,
  Page,
  RegulatorEvidence,
  RegulatorFilterOptions,
  RegulatorFilters,
  RegulatorKpis,
  WeeklyVolume,
} from "@/types/view-models";
import type { MohColor } from "@/types/waste";
import type { CertificateStatus } from "@/lib/statuses";
import { MAX_PAGE, MOH_HEX, PAGE_SIZE, loadActiveTripMap, num, pageSize, rows } from "./_shared";

/**
 * EFDA regulator queries (CLAUDE.md §3, §8): READ-ONLY, all facilities. One function per dashboard widget, each
 * starting with `requireRole("efda_officer")`; SQL aggregates, a LIMIT on every list, cursor paging (max 100).
 * Filters come from the URL: facility CODE and category code ("ALL" = no filter).
 */

const CODE = /^[A-Za-z0-9_-]{1,64}$/;

/** Reads ?facility=…&category=… safely (anything missing or malformed means "ALL"). */
export function parseRegulatorFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined
): RegulatorFilters {
  const pick = (key: string) => {
    const value = searchParams?.[key];
    return typeof value === "string" && CODE.test(value) ? value : "ALL";
  };
  return { facilityCode: pick("facility"), categoryCode: pick("category") };
}

/** A paging cursor from the URL, or null. */
export function parseCursor(value: string | string[] | undefined): string | null {
  return typeof value === "string" && CODE.test(value) ? value : null;
}

/** SQL conditions for waste row `w` joined to facility `f` and category `c`. */
function wasteScope(filters: RegulatorFilters): SQL {
  const parts: SQL[] = [sql`w.status <> 'CANCELLED'`];
  if (filters.facilityCode !== "ALL") parts.push(sql`f.code = ${filters.facilityCode}`);
  if (filters.categoryCode !== "ALL") parts.push(sql`c.code = ${filters.categoryCode}`);
  return sql.join(parts, sql` AND `);
}

export const getRegulatorFilterOptions = cache(async (): Promise<RegulatorFilterOptions> => {
  await requireRole("efda_officer");
  const [facilities, categories] = await Promise.all([
    rows<FacilityRef>(sql`
      SELECT id, code, name FROM facilities
      WHERE type <> 'DISPOSAL_SITE' ORDER BY name LIMIT 500`),
    rows<{ code: string; name: string; colour_code: MohColor }>(sql`
      SELECT code, name, colour_code FROM waste_categories WHERE active ORDER BY name LIMIT 100`),
  ]);
  return {
    facilities,
    categories: categories.map((c): CategoryRef => ({
      code: c.code,
      name: c.name,
      colourCode: c.colour_code,
      colourHex: MOH_HEX[c.colour_code] ?? "#71717a",
    })),
  };
});

export const getRegulatorKpis = cache(
  async (facilityCode: string, categoryCode: string): Promise<RegulatorKpis> => {
    await requireRole("efda_officer");
    const filters = { facilityCode, categoryCode };
    const facilityFilter = facilityCode === "ALL" ? sql`TRUE` : sql`f.code = ${facilityCode}`;
    const [[volume], [facilities], [certs]] = await Promise.all([
      rows<{ kg: string; containers: string }>(sql`
        SELECT coalesce(sum(w.weight_kg), 0) AS kg, coalesce(sum(w.container_count), 0) AS containers
        FROM waste_records w
        JOIN facilities f ON f.id = w.facility_id
        JOIN waste_categories c ON c.id = w.category_id
        WHERE ${wasteScope(filters)}`),
      rows<{ n: string }>(sql`
        SELECT count(*) AS n FROM facilities f
        WHERE f.type <> 'DISPOSAL_SITE' AND f.status = 'ACTIVE' AND ${facilityFilter}`),
      rows<{ issued: string; revoked: string }>(sql`
        SELECT count(*) FILTER (WHERE cert.status = 'ISSUED') AS issued,
               count(*) FILTER (WHERE cert.status = 'REVOKED') AS revoked
        FROM certificates cert
        JOIN disposal_records d ON d.id = cert.disposal_record_id
        JOIN waste_records w ON w.id = d.waste_record_id
        JOIN facilities f ON f.id = w.facility_id
        JOIN waste_categories c ON c.id = w.category_id
        WHERE ${wasteScope(filters)}`),
    ]);
    return {
      totalKg: Math.round(num(volume.kg) * 100) / 100,
      totalContainers: num(volume.containers),
      facilitiesCount: num(facilities.n),
      certificatesIssuedCount: num(certs.issued),
      certificatesRevokedCount: num(certs.revoked),
    };
  }
);

/** Waste registered per week (Monday–Sunday, EAT) over the last 8 weeks, empty weeks included. */
export const getRegulatorWeekly = cache(
  async (facilityCode: string, categoryCode: string): Promise<WeeklyVolume[]> => {
    await requireRole("efda_officer");
    const result = await rows<{ label: string; kg: string; containers: string }>(sql`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', now() AT TIME ZONE 'Africa/Addis_Ababa') - interval '7 weeks',
          date_trunc('week', now() AT TIME ZONE 'Africa/Addis_Ababa'),
          interval '1 week') AS wk
      ), volume AS (
        SELECT date_trunc('week', w.created_at AT TIME ZONE 'Africa/Addis_Ababa') AS wk,
               sum(w.weight_kg) AS kg, sum(w.container_count) AS containers
        FROM waste_records w
        JOIN facilities f ON f.id = w.facility_id
        JOIN waste_categories c ON c.id = w.category_id
        WHERE ${wasteScope({ facilityCode, categoryCode })}
          AND w.created_at >= (date_trunc('week', now() AT TIME ZONE 'Africa/Addis_Ababa') - interval '7 weeks')
                              AT TIME ZONE 'Africa/Addis_Ababa'
        GROUP BY 1
      )
      SELECT to_char(weeks.wk, '"W"IW (Mon DD)') AS label,
             coalesce(volume.kg, 0) AS kg, coalesce(volume.containers, 0) AS containers
      FROM weeks LEFT JOIN volume ON volume.wk = weeks.wk
      ORDER BY weeks.wk
      LIMIT 8`);
    return result.map((r) => ({
      weekLabel: r.label,
      kg: Math.round(num(r.kg) * 100) / 100,
      containers: num(r.containers),
    }));
  }
);

/** Volume per health facility (category filter applies; facility filter narrows to one). */
export const getRegulatorFacilityVolumes = cache(
  async (facilityCode: string, categoryCode: string): Promise<FacilityVolume[]> => {
    await requireRole("efda_officer");
    const categoryJoin = categoryCode === "ALL" ? sql`TRUE` : sql`c.code = ${categoryCode}`;
    const facilityFilter = facilityCode === "ALL" ? sql`TRUE` : sql`f.code = ${facilityCode}`;
    const result = await rows<{
      id: string;
      code: string;
      name: string;
      kg: string;
      containers: string;
    }>(sql`
      SELECT f.id, f.code, f.name,
             coalesce(sum(w.weight_kg), 0) AS kg, coalesce(sum(w.container_count), 0) AS containers
      FROM facilities f
      LEFT JOIN waste_records w ON w.facility_id = f.id AND w.status <> 'CANCELLED'
        AND EXISTS (SELECT 1 FROM waste_categories c WHERE c.id = w.category_id AND ${categoryJoin})
      WHERE f.type <> 'DISPOSAL_SITE' AND ${facilityFilter}
      GROUP BY f.id
      ORDER BY kg DESC, f.name
      LIMIT ${MAX_PAGE}`);
    return result.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      kg: Math.round(num(r.kg) * 100) / 100,
      containers: num(r.containers),
    }));
  }
);

/** Short readable summary of an audit entry's `after` data (keys and values, no nesting). */
function summarize(after: unknown): string {
  if (!after || typeof after !== "object") return "";
  return Object.entries(after as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 200);
}

/** Audit ledger, newest first; cursor = the `seq` of the last row shown. */
export const getRegulatorAuditPage = cache(
  async (cursor: string | null, limit = PAGE_SIZE): Promise<Page<AuditRow>> => {
    await requireRole("efda_officer");
    const size = pageSize(limit);
    const before = cursor && /^\d+$/.test(cursor) ? sql`a.seq < ${Number(cursor)}` : sql`TRUE`;
    const result = await rows<{
      id: string;
      seq: string;
      created_at: Date;
      actor_name: string | null;
      role: string | null;
      action: string;
      facility_name: string | null;
      after: unknown;
      ip: string | null;
    }>(sql`
      SELECT a.id, a.seq, a.created_at, u.full_name AS actor_name, a.role, a.action,
             f.name AS facility_name, a.after, a.ip
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      LEFT JOIN facilities f ON f.id = u.facility_id
      WHERE ${before}
      ORDER BY a.seq DESC
      LIMIT ${size + 1}`);
    const page = result.slice(0, size);
    return {
      rows: page.map((r) => ({
        id: r.id,
        seq: num(r.seq),
        at: new Date(r.created_at).toISOString(),
        actorName: r.actor_name,
        role: r.role,
        action: r.action,
        facilityName: r.facility_name,
        summary: summarize(r.after),
        ip: r.ip,
      })),
      nextCursor: result.length > size ? String(page[page.length - 1].seq) : null,
    };
  }
);

/** Certificates registry, newest number first; cursor = the last certificate number shown. */
export const getRegulatorCertificatesPage = cache(
  async (
    facilityCode: string,
    categoryCode: string,
    cursor: string | null,
    limit = PAGE_SIZE
  ): Promise<Page<CertificateRow>> => {
    await requireRole("efda_officer");
    const size = pageSize(limit);
    const after = cursor ? sql`cert.certificate_no < ${cursor}` : sql`TRUE`;
    const result = await rows<{
      id: string;
      certificate_no: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      status: CertificateStatus;
      issued_at: Date | null;
      method_code: string | null;
      weight_kg: string;
      container_count: number;
      verify_token: string;
    }>(sql`
      SELECT cert.id, cert.certificate_no, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name,
             cert.status, cert.issued_at, m.code AS method_code, w.weight_kg, w.container_count, cert.verify_token
      FROM certificates cert
      JOIN disposal_records d ON d.id = cert.disposal_record_id
      LEFT JOIN destruction_methods m ON m.id = d.method_id
      JOIN waste_records w ON w.id = d.waste_record_id
      JOIN facilities f ON f.id = w.facility_id
      JOIN waste_categories c ON c.id = w.category_id
      WHERE ${wasteScope({ facilityCode, categoryCode })} AND ${after}
      ORDER BY cert.certificate_no DESC
      LIMIT ${size + 1}`);
    const page = result.slice(0, size);
    return {
      rows: page.map((r) => ({
        id: r.id,
        certificateNo: r.certificate_no,
        facility: { id: r.facility_id, code: r.facility_code, name: r.facility_name },
        status: r.status,
        issuedOn: r.issued_at ? toEatDateString(r.issued_at) : null,
        methodCode: r.method_code ?? "",
        weightKg: num(r.weight_kg),
        containerCount: r.container_count,
        verifyToken: r.verify_token,
      })),
      nextCursor: result.length > size ? page[page.length - 1].certificate_no : null,
    };
  }
);

/** Vehicles on IN_PROGRESS trips and their stops (CLAUDE.md §6: positions only for trips in progress). */
export const getRegulatorMap = cache(async (): Promise<MapData> => {
  await requireRole("efda_officer");
  return loadActiveTripMap();
});

/** Overrides and arrivals outside the geofence or without GPS (last 90 days, newest first; read-only). */
export const getRegulatorEvidence = cache(async (): Promise<RegulatorEvidence> => {
  await requireRole("efda_officer");
  const [overrides, arrivals] = await Promise.all([
    rows<{ id: string; trip_code: string; facility_name: string; reason: string; at: Date }>(sql`
      SELECT s.id, t.trip_code, f.name AS facility_name, s.override_reason AS reason, s.completed_at AS at
      FROM trip_stops s JOIN trips t ON t.id = s.trip_id JOIN facilities f ON f.id = s.facility_id
      WHERE s.status = 'COLLECTED_OVERRIDE' AND s.completed_at >= now() - interval '90 days'
      ORDER BY s.completed_at DESC LIMIT 100`),
    rows<{
      id: string;
      trip_code: string;
      facility_name: string;
      arrived_at: Date;
      arrival_distance_m: number | null;
      geofence_ok: boolean | null;
    }>(sql`
      SELECT s.id, t.trip_code, f.name AS facility_name, s.arrived_at, s.arrival_distance_m, s.geofence_ok
      FROM trip_stops s JOIN trips t ON t.id = s.trip_id JOIN facilities f ON f.id = s.facility_id
      WHERE s.arrived_at IS NOT NULL AND s.arrived_at >= now() - interval '90 days'
        AND (s.geofence_ok IS NOT TRUE)
      ORDER BY s.arrived_at DESC LIMIT 100`),
  ]);
  return {
    overrides: overrides.map((o) => ({
      id: o.id,
      tripCode: o.trip_code,
      facilityName: o.facility_name,
      reason: o.reason,
      at: new Date(o.at).toISOString(),
    })),
    arrivals: arrivals.map((a) => ({
      id: a.id,
      tripCode: a.trip_code,
      facilityName: a.facility_name,
      arrivedAt: new Date(a.arrived_at).toISOString(),
      distanceM: a.arrival_distance_m,
      geofenceOk: a.geofence_ok,
    })),
  };
});
