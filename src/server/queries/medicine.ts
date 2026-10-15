import "server-only";
import { cache } from "react";
import { sql, type SQL } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import type { MedicineRequestStatus } from "@/lib/statuses";
import { requireRole } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import type {
  DisposalRequestRow,
  FacilityRef,
  Page,
  StockAlertRow,
  StockRow,
  StockState,
} from "@/types/view-models";
import { MAX_PAGE, num, rows } from "./_shared";

/**
 * Medicine stock reads (CLAUDE.md §12). Hospital roles: OWN facility only, inside SQL. super_admin and efda_officer:
 * every facility (optional facility filter). driver and disposal_operator: 403 (not in the role list).
 */

const READ_ROLES = ["hospital_admin", "hospital_staff", "super_admin", "efda_officer"] as const;
const CODE_RE = /^[A-Z]{2}-[A-Z]{3}-\d{3}$/;
export type StockFilter = "all" | "expiring" | "expired";

/** The facility condition for the caller (SQL), plus whether they are limited to one facility. */
async function scope(
  column: SQL,
  facilityCode?: string | null
): Promise<{ where: SQL; own: boolean }> {
  const user = await requireRole(...READ_ROLES);
  if (user.role === "hospital_admin" || user.role === "hospital_staff") {
    if (!user.facilityId)
      throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
    return { where: sql`${column} = ${user.facilityId}`, own: true };
  }
  if (facilityCode && CODE_RE.test(facilityCode)) {
    return {
      where: sql`${column} = (SELECT id FROM facilities WHERE code = ${facilityCode})`,
      own: false,
    };
  }
  return { where: sql`TRUE`, own: false };
}

const horizonDays = async () => Math.max(...(await getSetting("expiry_alert_days")), 0);
const today = () => toEatDateString(new Date());
const stateOf = (daysLeft: number, horizon: number): StockState =>
  daysLeft < 0 ? "EXPIRED" : daysLeft <= horizon ? "EXPIRING_SOON" : "ACTIVE";

export function parseStockFilter(v: unknown): StockFilter {
  return v === "expiring" || v === "expired" ? v : "all";
}

/** Stock lines (active), soonest expiry first; cursor pagination by (expiry date, id), at most 100 per page. */
export const getStockPage = cache(
  async (
    filter: StockFilter,
    facilityCode: string | null,
    cursor: string | null,
    limit = 100
  ): Promise<Page<StockRow>> => {
    const { where } = await scope(sql`s.facility_id`, facilityCode);
    const horizon = await horizonDays();
    const t = today();
    const size = Math.min(Math.max(limit, 1), MAX_PAGE);
    const byFilter =
      filter === "expired"
        ? sql`s.expiry_date < ${t}::date`
        : filter === "expiring"
          ? sql`s.expiry_date >= ${t}::date AND s.expiry_date <= ${t}::date + ${horizon}::int`
          : sql`TRUE`;
    const m = cursor ? /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/i.exec(cursor) : null;
    const after = m ? sql`(s.expiry_date, s.id) > (${m[1]}::date, ${m[2]}::uuid)` : sql`TRUE`;
    const result = await rows<{
      id: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      item: string;
      strength: string;
      form: string;
      batch: string;
      quantity: number;
      unit: string;
      expiry_date: string;
      days_left: number;
      last_alert: number | null;
    }>(sql`
      SELECT s.id, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name, s.item, s.strength, s.form,
             s.batch, s.quantity, s.unit, to_char(s.expiry_date, 'YYYY-MM-DD') AS expiry_date,
             (s.expiry_date - ${t}::date) AS days_left,
             (SELECT min(a.threshold_days) FROM medicine_stock_alerts a WHERE a.stock_id = s.id) AS last_alert
      FROM medicine_stock s JOIN facilities f ON f.id = s.facility_id
      WHERE s.active AND ${where} AND ${byFilter} AND ${after}
      ORDER BY s.expiry_date, s.id
      LIMIT ${size + 1}`);
    const page = result.slice(0, size);
    const last = page[page.length - 1];
    return {
      rows: page.map((r) => ({
        id: r.id,
        facility: { id: r.facility_id, code: r.facility_code, name: r.facility_name },
        item: r.item,
        strength: r.strength,
        form: r.form,
        batch: r.batch,
        quantity: num(r.quantity),
        unit: r.unit,
        expiryDate: r.expiry_date,
        daysLeft: num(r.days_left),
        state: stateOf(num(r.days_left), horizon),
        lastAlertDays: r.last_alert === null ? null : num(r.last_alert),
      })),
      nextCursor: result.length > size && last ? `${last.expiry_date}|${last.id}` : null,
    };
  }
);

/** Open expiry alerts: lines with stock left that reached a threshold, most urgent first (at most 50). */
export const getStockAlerts = cache(
  async (facilityCode: string | null = null): Promise<StockAlertRow[]> => {
    const { where } = await scope(sql`s.facility_id`, facilityCode);
    const t = today();
    const result = await rows<{
      stock_id: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      item: string;
      strength: string;
      batch: string;
      quantity: number;
      unit: string;
      expiry_date: string;
      days_left: number;
      threshold: number;
    }>(sql`
    SELECT s.id AS stock_id, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name, s.item, s.strength,
           s.batch, s.quantity, s.unit, to_char(s.expiry_date, 'YYYY-MM-DD') AS expiry_date,
           (s.expiry_date - ${t}::date) AS days_left, a.threshold
    FROM medicine_stock s
    JOIN facilities f ON f.id = s.facility_id
    JOIN LATERAL (SELECT min(threshold_days) AS threshold FROM medicine_stock_alerts WHERE stock_id = s.id) a ON TRUE
    WHERE s.active AND s.quantity > 0 AND a.threshold IS NOT NULL AND ${where}
    ORDER BY s.expiry_date, s.id
    LIMIT 50`);
    return result.map((r) => ({
      stockId: r.stock_id,
      facility: { id: r.facility_id, code: r.facility_code, name: r.facility_name },
      item: r.item,
      strength: r.strength,
      batch: r.batch,
      quantity: num(r.quantity),
      unit: r.unit,
      expiryDate: r.expiry_date,
      daysLeft: num(r.days_left),
      thresholdDays: num(r.threshold),
    }));
  }
);

/** Disposal requests, newest first (at most 100), optionally by status. */
export const getDisposalRequests = cache(
  async (
    status: MedicineRequestStatus | null = null,
    facilityCode: string | null = null
  ): Promise<DisposalRequestRow[]> => {
    const { where } = await scope(sql`r.facility_id`, facilityCode);
    const byStatus = status ? sql`r.status = ${status}` : sql`TRUE`;
    const result = await rows<{
      id: string;
      request_code: string;
      facility_id: string;
      facility_code: string;
      facility_name: string;
      status: MedicineRequestStatus;
      requested_by: string;
      created_at: Date;
      container_count: number;
      weight_kg: string;
      scheduled_date: string | null;
      note: string | null;
      decision_reason: string | null;
      decided_at: Date | null;
      waste_code: string | null;
      lines: DisposalRequestRow["lines"] | null;
    }>(sql`
      SELECT r.id, r.request_code, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name, r.status,
             u.full_name AS requested_by, r.created_at, r.container_count, r.weight_kg,
             to_char(r.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             r.note, r.decision_reason, r.decided_at, w.waste_code,
             (SELECT json_agg(json_build_object('item', l.item, 'strength', l.strength, 'form', l.form, 'batch', l.batch,
                     'quantity', l.quantity, 'unit', l.unit, 'expiryDate', to_char(l.expiry_date, 'YYYY-MM-DD'))
                     ORDER BY l.item)
                FROM medicine_disposal_request_lines l WHERE l.request_id = r.id) AS lines
      FROM medicine_disposal_requests r
      JOIN facilities f ON f.id = r.facility_id
      JOIN users u ON u.id = r.requested_by
      LEFT JOIN waste_records w ON w.id = r.waste_record_id
      WHERE ${where} AND ${byStatus}
      ORDER BY (r.status = 'PENDING_APPROVAL') DESC, r.created_at DESC
      LIMIT 100`);
    return result.map((r) => ({
      id: r.id,
      requestCode: r.request_code,
      facility: { id: r.facility_id, code: r.facility_code, name: r.facility_name },
      status: r.status,
      requestedBy: r.requested_by,
      createdAt: new Date(r.created_at).toISOString(),
      containerCount: num(r.container_count),
      weightKg: Number(r.weight_kg),
      scheduledDate: r.scheduled_date ?? null,
      note: r.note,
      decisionReason: r.decision_reason,
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      wasteCode: r.waste_code,
      lines: (r.lines ?? []).map((l) => ({ ...l, quantity: num(l.quantity) })),
    }));
  }
);

/** Health facilities for the facility filter (super_admin / EFDA). */
export const getStockFacilityOptions = cache(async (): Promise<FacilityRef[]> => {
  await requireRole("super_admin", "efda_officer");
  return rows<FacilityRef>(sql`
    SELECT id, code, name FROM facilities WHERE type <> 'DISPOSAL_SITE' ORDER BY name LIMIT 500`);
});

export function parseFacilityCode(v: unknown): string | null {
  return typeof v === "string" && CODE_RE.test(v) ? v : null;
}
