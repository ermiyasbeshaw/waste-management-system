import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import type { InvoiceStatus, StopStatus } from "@/lib/statuses";
import { db, withDbRetry } from "@/server/db/client";
import { maskPhone } from "@/lib/redact";
import type { InvoiceRow, MapData, UserRow } from "@/types/view-models";

/**
 * Helpers shared by the area query modules. NO access checks here: every exported query in
 * `src/server/queries/<area>.ts` calls `requireRole` (and its scope) BEFORE using these.
 */

export const PAGE_SIZE = 50;
export const MAX_PAGE = 100;

/** Colour of each MoH colour code (charts and dots). */
export const MOH_HEX: Record<string, string> = {
  YELLOW: "#eab308",
  RED: "#ef4444",
  BLUE: "#3b82f6",
  BROWN: "#b45309",
  BLACK: "#52525b",
  WHITE: "#e4e4e7",
};

export const num = (v: unknown) => Number(v ?? 0);
export const round2 = (v: unknown) => Math.round(num(v) * 100) / 100;

/** Runs a READ-ONLY query; transient network failures (e.g. a dropped Neon WebSocket) are retried. */
export async function rows<T>(query: SQL): Promise<T[]> {
  return withDbRetry(async () => (await db.execute(query)).rows as T[]);
}

/** Clamp a requested page size to 1 … MAX_PAGE. */
export const pageSize = (limit: number) => Math.min(Math.max(limit, 1), MAX_PAGE);

// ---------- invoices ----------

export type InvoiceDbRow = {
  id: string;
  invoice_no: string;
  facility_id: string;
  facility_code: string;
  facility_name: string;
  period_start: string;
  subtotal_santim: string;
  vat_santim: string;
  total_santim: string;
  status: InvoiceStatus;
  issued_at: Date | null;
  due_date: string | null;
};

export const INVOICE_SELECT = sql`
  SELECT i.id, i.invoice_no, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name,
         to_char(i.period_start, 'YYYY-MM-DD') AS period_start, i.subtotal_santim, i.vat_santim, i.total_santim,
         i.status, i.issued_at, to_char(i.due_date, 'YYYY-MM-DD') AS due_date
  FROM invoices i
  JOIN facilities f ON f.id = i.facility_id`;

/** Maps an invoice row; `overdue` is derived (ISSUED and due date before today in EAT), never stored. */
export function toInvoiceRow(r: InvoiceDbRow, today = toEatDateString(new Date())): InvoiceRow {
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${r.period_start}T12:00:00Z`));
  return {
    id: r.id,
    invoiceNo: r.invoice_no,
    facility: { id: r.facility_id, code: r.facility_code, name: r.facility_name },
    billingPeriod: label,
    subtotalSantim: num(r.subtotal_santim),
    vatSantim: num(r.vat_santim),
    totalSantim: num(r.total_santim),
    status: r.status,
    issuedOn: r.issued_at ? toEatDateString(r.issued_at) : null,
    dueDate: r.due_date,
    overdue: r.status === "ISSUED" && !!r.due_date && r.due_date < today,
  };
}

// ---------- map ----------

/** Vehicles on IN_PROGRESS trips and their stops (CLAUDE.md §6: positions only for trips in progress). */
export async function loadActiveTripMap(): Promise<MapData> {
  const [vehicles, stops] = await Promise.all([
    rows<{
      id: string;
      plate_no: string;
      trip_code: string;
      driver_name: string;
      lat: number | null;
      lng: number | null;
      speed_kmh: number | null;
      recorded_at: Date | null;
    }>(sql`
      SELECT v.id, v.plate_no, t.trip_code, u.full_name AS driver_name,
             g.lat, g.lng, g.speed_kmh, g.recorded_at
      FROM trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      JOIN drivers d ON d.id = t.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN LATERAL (
        SELECT e.lat, e.lng, e.speed_kmh, e.recorded_at FROM gps_events e
        WHERE e.vehicle_id = v.id AND e.recorded_at >= t.started_at
        ORDER BY e.recorded_at DESC LIMIT 1
      ) g ON TRUE
      WHERE t.status = 'IN_PROGRESS'
      ORDER BY v.plate_no
      LIMIT 10`),
    rows<{
      id: string;
      priority_order: number;
      trip_code: string;
      name: string;
      address: string;
      status: StopStatus;
      lat: number | null;
      lng: number | null;
    }>(sql`
      SELECT s.id, s.priority_order, t.trip_code, f.name, f.address, s.status, f.lat, f.lng
      FROM trips t
      JOIN trip_stops s ON s.trip_id = t.id
      JOIN facilities f ON f.id = s.facility_id
      WHERE t.status = 'IN_PROGRESS'
      ORDER BY t.trip_code, s.priority_order
      LIMIT 50`),
  ]);
  const coord = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    vehicles: vehicles.map((v) => ({
      id: v.id,
      plateNumber: v.plate_no,
      tripCode: v.trip_code,
      lat: coord(v.lat),
      lng: coord(v.lng),
      speedKmh: v.speed_kmh === null ? null : Math.round(Number(v.speed_kmh)),
      lastSeenAt: v.recorded_at ? new Date(v.recorded_at).toISOString() : null,
      driverName: v.driver_name,
    })),
    stops: stops.map((s) => ({
      id: s.id,
      order: s.priority_order,
      tripCode: s.trip_code,
      facilityName: s.name,
      address: s.address,
      status: s.status,
      lat: coord(s.lat),
      lng: coord(s.lng),
    })),
  };
}

// ---------- users ----------

export type UserDbRow = {
  id: string;
  full_name: string;
  email: string;
  phone_e164: string | null;
  phone_verified: boolean;
  role: string | null;
  facility_id: string | null;
  facility_code: string | null;
  facility_name: string | null;
  active: boolean;
  receives_pickup_otp: boolean;
};

export const USER_SELECT = sql`
  SELECT u.id, u.full_name, u.email, u.phone_e164, u.phone_verified, u.role, u.facility_id,
         f.code AS facility_code, f.name AS facility_name, u.active, u.receives_pickup_otp
  FROM users u LEFT JOIN facilities f ON f.id = u.facility_id`;

export function toUserRow(u: UserDbRow): UserRow {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phoneMasked: u.phone_e164 ? maskPhone(u.phone_e164) : null,
    phoneVerified: u.phone_verified,
    role: u.role,
    facility:
      u.facility_id && u.facility_code && u.facility_name
        ? { id: u.facility_id, code: u.facility_code, name: u.facility_name }
        : null,
    active: u.active,
    receivesPickupOtp: u.receives_pickup_otp,
  };
}
