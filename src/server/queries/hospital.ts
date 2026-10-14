import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import type { CertificateStatus, WasteStatus } from "@/lib/statuses";
import { EFDA_APPROVAL_CATEGORIES } from "@/lib/validation/waste";
import { requireRole } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import type {
  ActiveHandover,
  CategoryRef,
  CertificateRow,
  HospitalFacility,
  HospitalKpis,
  InvoiceRow,
  Page,
  UserRow,
  WasteRow,
} from "@/types/view-models";
import type { MohColor } from "@/types/waste";
import {
  INVOICE_SELECT,
  MAX_PAGE,
  MOH_HEX,
  PAGE_SIZE,
  num,
  pageSize,
  round2,
  rows,
  toInvoiceRow,
  type InvoiceDbRow,
  USER_SELECT,
  toUserRow,
} from "./_shared";

/**
 * Hospital queries (CLAUDE.md §3, §8): ALWAYS the signed-in user's own facility — taken from the `users` row and
 * filtered inside SQL (`WHERE facility_id = …`), never from the URL. One function per widget; LIMIT on every
 * list; cursor paging (max 100). Invoices: hospital_admin only, and never drafts.
 */

const CURSOR = /^[A-Z0-9-]{1,32}$/;

/** The caller's facility id (hospital roles always have one — CHECK constraint, CLAUDE.md §3). */
async function ownFacility(...roles: ("hospital_admin" | "hospital_staff")[]): Promise<string> {
  const user = roles.length
    ? await requireRole(...roles)
    : await requireRole("hospital_admin", "hospital_staff");
  if (!user.facilityId)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  return user.facilityId;
}

/** A paging cursor from the URL (a waste / certificate / invoice code), or null. */
export function parseHospitalCursor(value: string | string[] | undefined): string | null {
  return typeof value === "string" && CURSOR.test(value) ? value : null;
}

export const getHospitalFacility = cache(async (): Promise<HospitalFacility | null> => {
  const facilityId = await ownFacility();
  const [row] = await rows<{
    id: string;
    code: string;
    name: string;
    address: string;
    recipients: string;
  }>(sql`
    SELECT f.id, f.code, f.name, f.address,
           (SELECT count(*) FROM users u
            WHERE u.facility_id = f.id AND u.active AND u.phone_verified AND u.receives_pickup_otp
              AND u.role IN ('hospital_admin', 'hospital_staff')) AS recipients
    FROM facilities f
    WHERE f.id = ${facilityId}
    LIMIT 1`);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    otpRecipientCount: num(row.recipients),
  };
});

export const getHospitalKpis = cache(async (): Promise<HospitalKpis> => {
  const facilityId = await ownFacility();
  const [k] = await rows<Record<string, string>>(sql`
    SELECT
      count(*) FILTER (WHERE w.status = 'REGISTERED') AS waiting_count,
      coalesce(sum(w.weight_kg) FILTER (WHERE w.status = 'REGISTERED'), 0) AS waiting_kg,
      count(*) FILTER (WHERE w.status = 'SCHEDULED') AS scheduled_count,
      count(*) FILTER (WHERE w.status = 'IN_TRANSIT') AS in_transit_count,
      count(*) FILTER (WHERE w.status IN ('DISPOSED', 'DISPOSED_WITH_EXCEPTION')
        AND date_trunc('month', d.destroyed_at AT TIME ZONE 'Africa/Addis_Ababa')
          = date_trunc('month', now() AT TIME ZONE 'Africa/Addis_Ababa')) AS disposed_count,
      coalesce(sum(w.weight_kg) FILTER (WHERE w.status IN ('DISPOSED', 'DISPOSED_WITH_EXCEPTION')
        AND date_trunc('month', d.destroyed_at AT TIME ZONE 'Africa/Addis_Ababa')
          = date_trunc('month', now() AT TIME ZONE 'Africa/Addis_Ababa')), 0) AS disposed_kg
    FROM waste_records w
    LEFT JOIN disposal_records d ON d.waste_record_id = w.id
    WHERE w.facility_id = ${facilityId}`);
  return {
    waitingPickupCount: num(k.waiting_count),
    waitingPickupKg: round2(k.waiting_kg),
    scheduledCount: num(k.scheduled_count),
    inTransitCount: num(k.in_transit_count),
    disposedThisMonthCount: num(k.disposed_count),
    disposedThisMonthKg: round2(k.disposed_kg),
  };
});

/** Own waste records, newest code first; cursor = the last waste code shown. */
export const getHospitalWastePage = cache(
  async (cursor: string | null, limit = PAGE_SIZE): Promise<Page<WasteRow>> => {
    const facilityId = await ownFacility();
    const size = pageSize(limit);
    const after = cursor ? sql`w.waste_code < ${cursor}` : sql`TRUE`;
    const result = await rows<{
      id: string;
      waste_code: string;
      code: string;
      name: string;
      colour_code: MohColor;
      container_count: number;
      weight_kg: string;
      status: WasteStatus;
      created_at: Date;
    }>(sql`
      SELECT w.id, w.waste_code, c.code, c.name, c.colour_code, w.container_count, w.weight_kg, w.status,
             w.created_at
      FROM waste_records w
      JOIN waste_categories c ON c.id = w.category_id
      WHERE w.facility_id = ${facilityId} AND ${after}
      ORDER BY w.waste_code DESC
      LIMIT ${size + 1}`);
    const page = result.slice(0, size);
    return {
      rows: page.map((r) => ({
        id: r.id,
        wasteCode: r.waste_code,
        category: {
          code: r.code,
          name: r.name,
          colourCode: r.colour_code,
          colourHex: MOH_HEX[r.colour_code] ?? "#71717a",
        },
        containerCount: r.container_count,
        weightKg: round2(r.weight_kg),
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      nextCursor: result.length > size ? page[page.length - 1].waste_code : null,
    };
  }
);

/** Certificates for the facility's waste, newest number first. */
export const getHospitalCertificatesPage = cache(
  async (cursor: string | null, limit = PAGE_SIZE): Promise<Page<CertificateRow>> => {
    const facilityId = await ownFacility();
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
      WHERE w.facility_id = ${facilityId} AND ${after}
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
        weightKg: round2(r.weight_kg),
        containerCount: r.container_count,
        verifyToken: r.verify_token,
      })),
      nextCursor: result.length > size ? page[page.length - 1].certificate_no : null,
    };
  }
);

/** All invoices of the facility except drafts (hospital_admin only), newest number first. */
export const getHospitalInvoicesPage = cache(
  async (cursor: string | null, limit = PAGE_SIZE): Promise<Page<InvoiceRow>> => {
    const facilityId = await ownFacility("hospital_admin");
    const size = pageSize(limit);
    const after = cursor ? sql`i.invoice_no < ${cursor}` : sql`TRUE`;
    const result = await rows<InvoiceDbRow>(sql`
      ${INVOICE_SELECT}
      WHERE i.facility_id = ${facilityId} AND i.status <> 'DRAFT' AND ${after}
      ORDER BY i.invoice_no DESC
      LIMIT ${size + 1}`);
    const today = toEatDateString(new Date());
    const page = result.slice(0, size);
    return {
      rows: page.map((r) => toInvoiceRow(r, today)),
      nextCursor: result.length > size ? page[page.length - 1].invoice_no : null,
    };
  }
);

/** Issued, unsettled invoices and their total (hospital_admin only). */
export const getHospitalOutstanding = cache(
  async (): Promise<{ rows: InvoiceRow[]; totalSantim: number }> => {
    const facilityId = await ownFacility("hospital_admin");
    const result = await rows<InvoiceDbRow>(sql`
      ${INVOICE_SELECT}
      WHERE i.facility_id = ${facilityId} AND i.status = 'ISSUED'
      ORDER BY i.due_date, i.invoice_no
      LIMIT ${MAX_PAGE}`);
    const today = toEatDateString(new Date());
    const list = result.map((r) => toInvoiceRow(r, today));
    return { rows: list, totalSantim: list.reduce((n, i) => n + i.totalSantim, 0) };
  }
);

/**
 * Active waste categories for the direct registration form (hospital roles). Medicine categories are left out: they
 * need an EFDA-approved disposal request (CLAUDE.md §12, owner decision 11 Oct 2026).
 */
export const getHospitalCategories = cache(async (): Promise<CategoryRef[]> => {
  await ownFacility();
  const excluded = sql.join(
    EFDA_APPROVAL_CATEGORIES.map((c) => sql`${c}`),
    sql`, `
  );
  const result = await rows<{ code: string; name: string; colour_code: MohColor }>(sql`
    SELECT code, name, colour_code FROM waste_categories
    WHERE active AND code NOT IN (${excluded})
    ORDER BY name LIMIT 100`);
  return result.map((c) => ({
    code: c.code,
    name: c.name,
    colourCode: c.colour_code,
    colourHex: MOH_HEX[c.colour_code] ?? "#71717a",
  }));
});

/** hospital_admin: the users of their own facility (identity from Clerk; phone masked). */
export const getHospitalUsers = cache(async (): Promise<UserRow[]> => {
  const facilityId = await ownFacility("hospital_admin");
  const result = await rows<Parameters<typeof toUserRow>[0]>(sql`
    ${USER_SELECT} WHERE u.facility_id = ${facilityId} ORDER BY u.full_name LIMIT 200`);
  return result.map(toUserRow);
});

/** ARRIVED stops at the user's own facility, with scan progress (polled every 10 s by the hospital card). */
export const getHospitalActiveHandovers = cache(async (): Promise<ActiveHandover[]> => {
  const facilityId = await ownFacility();
  const result = await rows<{
    stop_id: string;
    trip_code: string;
    plate_no: string;
    driver_name: string;
    arrived_at: Date;
    expected: string;
    scanned: string;
    otp_expires_at: Date | null;
  }>(sql`
    SELECT s.id AS stop_id, t.trip_code, v.plate_no, u.full_name AS driver_name, s.arrived_at,
           (SELECT count(*) FROM trip_stop_waste l JOIN containers c ON c.waste_record_id = l.waste_record_id
              WHERE l.trip_stop_id = s.id AND l.active) AS expected,
           (SELECT count(*) FROM handovers h WHERE h.trip_stop_id = s.id AND h.status = 'SCANNED') AS scanned,
           (SELECT o.expires_at FROM otp_codes o WHERE o.trip_stop_id = s.id AND o.status = 'ISSUED'
              AND o.expires_at > now() LIMIT 1) AS otp_expires_at
    FROM trip_stops s
    JOIN trips t ON t.id = s.trip_id
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
    JOIN users u ON u.id = d.user_id
    WHERE s.facility_id = ${facilityId} AND s.status = 'ARRIVED' AND t.status = 'IN_PROGRESS'
    ORDER BY s.arrived_at
    LIMIT 5`);
  return result.map((r) => ({
    stopId: r.stop_id,
    tripCode: r.trip_code,
    vehiclePlate: r.plate_no,
    driverName: r.driver_name,
    arrivedAt: new Date(r.arrived_at).toISOString(),
    expectedContainers: num(r.expected),
    scannedContainers: num(r.scanned),
    otpActive: r.otp_expires_at !== null,
    otpExpiresAt: r.otp_expires_at ? new Date(r.otp_expires_at).toISOString() : null,
  }));
});
