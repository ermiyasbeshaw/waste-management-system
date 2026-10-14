import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import type { ContractStatus, TripStatus } from "@/lib/statuses";
import { requireRole } from "@/server/auth/current-user";
import { getSetting } from "@/server/services/settings";
import type {
  AdminAlerts,
  AdminCertificateRow,
  FacilityDetail,
  FacilityRow,
  FleetData,
  TripDetail,
  TripDetailStop,
  TripListRow,
  TripPlanningOptions,
  WaitingFacility,
  LicenceState,
  UserRow,
  AdminKpis,
  CategoryVolume,
  ContractRow,
  FacilityRef,
  InvoiceRow,
  MapData,
  Page,
  TripRow,
} from "@/types/view-models";
import type { MohColor } from "@/types/waste";
import {
  INVOICE_SELECT,
  MOH_HEX,
  PAGE_SIZE,
  loadActiveTripMap,
  num,
  pageSize,
  round2,
  rows,
  toInvoiceRow,
  type InvoiceDbRow,
  type UserDbRow,
  USER_SELECT,
  toUserRow,
} from "./_shared";

/**
 * Super Administrator queries (CLAUDE.md §3, §8): oversight of every facility. One function per widget, each
 * starting with `requireRole("super_admin")`; SQL aggregates, LIMIT on every list, thresholds from settings.
 */

const CURSOR = /^[A-Z0-9-]{1,32}$/;

/** A paging cursor (an invoice number) from the URL, or null. */
export function parseAdminCursor(value: string | string[] | undefined): string | null {
  return typeof value === "string" && CURSOR.test(value) ? value : null;
}

const today = () => toEatDateString(new Date());

export const getAdminKpis = cache(async (): Promise<AdminKpis> => {
  await requireRole("super_admin");
  const overdueDays = await getSetting("overdue_pickup_days");
  const [k] = await rows<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM waste_records WHERE status = 'REGISTERED') AS awaiting_count,
      (SELECT coalesce(sum(weight_kg), 0) FROM waste_records WHERE status = 'REGISTERED') AS awaiting_kg,
      (SELECT count(*) FROM waste_records WHERE status = 'REGISTERED'
         AND created_at < now() - make_interval(days => ${overdueDays})) AS overdue_count,
      (SELECT count(*) FROM trips WHERE planned_date = ${today()}::date AND status <> 'CANCELLED') AS trips_today,
      (SELECT count(*) FROM trips WHERE status = 'IN_PROGRESS') AS trips_in_progress,
      (SELECT count(*) FROM waste_records WHERE status = 'IN_TRANSIT') AS in_transit,
      (SELECT count(*) FROM containers WHERE status = 'RECEIVED') AS awaiting_destruction,
      (SELECT count(*) FROM invoices WHERE status = 'ISSUED') AS outstanding_count,
      (SELECT coalesce(sum(total_santim), 0) FROM invoices WHERE status = 'ISSUED') AS outstanding_santim,
      (SELECT count(*) FROM invoices WHERE status = 'SETTLED_OFFLINE') AS settled_count,
      (SELECT coalesce(sum(total_santim), 0) FROM invoices WHERE status = 'SETTLED_OFFLINE') AS settled_santim,
      (SELECT count(*) FROM invoices WHERE status = 'DRAFT') AS draft_count`);
  return {
    awaitingPickupCount: num(k.awaiting_count),
    awaitingPickupKg: round2(k.awaiting_kg),
    tripsTodayCount: num(k.trips_today),
    tripsInProgressCount: num(k.trips_in_progress),
    inTransitCount: num(k.in_transit),
    awaitingDestructionCount: num(k.awaiting_destruction),
    overduePickupsCount: num(k.overdue_count),
    overduePickupDays: overdueDays,
    outstandingSantim: num(k.outstanding_santim),
    outstandingCount: num(k.outstanding_count),
    settledSantim: num(k.settled_santim),
    settledCount: num(k.settled_count),
    draftCount: num(k.draft_count),
  };
});

/** Trips planned for today (EAT) plus any trip still in progress. */
export const getAdminTripsToday = cache(async (): Promise<TripRow[]> => {
  await requireRole("super_admin");
  const result = await rows<{
    id: string;
    trip_code: string;
    planned_date: string;
    status: TripStatus;
    plate_no: string;
    driver_name: string;
    stops_done: string;
    stops_total: string;
    containers: string;
    kg: string;
  }>(sql`
    SELECT t.id, t.trip_code, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date, t.status,
           v.plate_no, u.full_name AS driver_name,
           (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id
              AND s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE', 'SKIPPED')) AS stops_done,
           (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id) AS stops_total,
           (SELECT coalesce(sum(w.container_count), 0) FROM trip_stops s
              JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
              JOIN waste_records w ON w.id = l.waste_record_id WHERE s.trip_id = t.id) AS containers,
           (SELECT coalesce(sum(w.weight_kg), 0) FROM trip_stops s
              JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
              JOIN waste_records w ON w.id = l.waste_record_id WHERE s.trip_id = t.id) AS kg
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
    JOIN users u ON u.id = d.user_id
    WHERE t.planned_date = ${today()}::date OR t.status = 'IN_PROGRESS'
    ORDER BY t.trip_code
    LIMIT 50`);
  return result.map((t) => ({
    id: t.id,
    tripCode: t.trip_code,
    plannedDate: t.planned_date,
    status: t.status,
    vehiclePlate: t.plate_no,
    driverName: t.driver_name,
    stopsCompleted: num(t.stops_done),
    stopsTotal: num(t.stops_total),
    containersTotal: num(t.containers),
    weightKgTotal: round2(t.kg),
  }));
});

export const getAdminMap = cache(async (): Promise<MapData> => {
  await requireRole("super_admin");
  return loadActiveTripMap();
});

/** kg per active category over the last 30 days (cancelled waste excluded). */
export const getAdminCategoryVolume = cache(async (): Promise<CategoryVolume[]> => {
  await requireRole("super_admin");
  const result = await rows<{ code: string; name: string; colour_code: MohColor; kg: string }>(sql`
    SELECT c.code, c.name, c.colour_code, coalesce(sum(w.weight_kg), 0) AS kg
    FROM waste_categories c
    LEFT JOIN waste_records w ON w.category_id = c.id AND w.status <> 'CANCELLED'
      AND w.created_at >= now() - interval '30 days'
    WHERE c.active
    GROUP BY c.id
    ORDER BY c.name
    LIMIT 100`);
  return result.map((c) => ({
    code: c.code,
    name: c.name,
    colourCode: c.colour_code,
    colourHex: MOH_HEX[c.colour_code] ?? "#71717a",
    kg: round2(c.kg),
  }));
});

/** All invoices (drafts included), newest number first. */
export const getAdminInvoicesPage = cache(
  async (cursor: string | null, limit = PAGE_SIZE): Promise<Page<InvoiceRow>> => {
    await requireRole("super_admin");
    const size = pageSize(limit);
    const after = cursor ? sql`i.invoice_no < ${cursor}` : sql`TRUE`;
    const result = await rows<InvoiceDbRow>(sql`
      ${INVOICE_SELECT}
      WHERE ${after}
      ORDER BY i.invoice_no DESC
      LIMIT ${size + 1}`);
    const page = result.slice(0, size);
    const t = today();
    return {
      rows: page.map((r) => toInvoiceRow(r, t)),
      nextCursor: result.length > size ? page[page.length - 1].invoice_no : null,
    };
  }
);

export const getAdminContracts = cache(
  async (): Promise<{ contracts: ContractRow[]; uncontractedFacilities: FacilityRef[] }> => {
    await requireRole("super_admin");
    const [contracts, uncontracted] = await Promise.all([
      rows<{
        id: string;
        contract_code: string;
        facility_id: string;
        facility_code: string;
        facility_name: string;
        start_date: string;
        end_date: string;
        monthly_fee_santim: string;
        status: ContractStatus;
        days_left: number;
        terms: string | null;
      }>(sql`
        SELECT ct.id, ct.contract_code, f.id AS facility_id, f.code AS facility_code, f.name AS facility_name,
               to_char(ct.start_date, 'YYYY-MM-DD') AS start_date, to_char(ct.end_date, 'YYYY-MM-DD') AS end_date,
               ct.monthly_fee_santim, ct.status, (ct.end_date - ${today()}::date) AS days_left, ct.terms
        FROM contracts ct JOIN facilities f ON f.id = ct.facility_id
        ORDER BY ct.end_date, ct.contract_code
        LIMIT 500`),
      rows<FacilityRef>(sql`
        SELECT f.id, f.code, f.name FROM facilities f
        WHERE f.type <> 'DISPOSAL_SITE' AND f.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM contracts ct WHERE ct.facility_id = f.id
                          AND ct.status IN ('ACTIVE', 'EXPIRING_SOON'))
        ORDER BY f.name LIMIT 500`),
    ]);
    return {
      contracts: contracts.map((c) => ({
        id: c.id,
        contractCode: c.contract_code,
        facility: { id: c.facility_id, code: c.facility_code, name: c.facility_name },
        startDate: c.start_date,
        endDate: c.end_date,
        monthlyFeeSantim: num(c.monthly_fee_santim),
        status: c.status,
        daysUntilExpiry: num(c.days_left),
        terms: c.terms,
      })),
      uncontractedFacilities: uncontracted,
    };
  }
);

/** Dashboard alerts (CLAUDE.md §6). Thresholds come from settings, never hard-coded. */
export const getAdminAlerts = cache(async (): Promise<AdminAlerts> => {
  await requireRole("super_admin");
  const [overdueDays, silentMinutes, licenceDays] = await Promise.all([
    getSetting("overdue_pickup_days"),
    getSetting("tracker_silent_minutes"),
    getSetting("license_expiry_warning_days"),
  ]);
  const t = today();
  const [
    overrides,
    noTracker,
    uncontracted,
    notReady,
    overdue,
    silent,
    failed,
    overdueInv,
    licences,
    disposalExceptions,
  ] = await Promise.all([
    rows<{ id: string; facility_name: string; reason: string; at: Date }>(sql`
        SELECT s.id, f.name AS facility_name, s.override_reason AS reason, s.completed_at AS at
        FROM trip_stops s JOIN facilities f ON f.id = s.facility_id
        WHERE s.status = 'COLLECTED_OVERRIDE' AND s.completed_at >= now() - interval '30 days'
        ORDER BY s.completed_at DESC LIMIT 50`),
    rows<{ id: string; plate_no: string; model: string | null }>(sql`
        SELECT v.id, v.plate_no, v.model FROM vehicles v
        WHERE v.active AND NOT EXISTS (SELECT 1 FROM tracker_devices d WHERE d.vehicle_id = v.id AND d.active)
        ORDER BY v.plate_no LIMIT 50`),
    rows<FacilityRef>(sql`
        SELECT f.id, f.code, f.name FROM facilities f
        WHERE f.type <> 'DISPOSAL_SITE' AND f.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM contracts ct WHERE ct.facility_id = f.id
                          AND ct.status IN ('ACTIVE', 'EXPIRING_SOON'))
        ORDER BY f.name LIMIT 100`),
    rows<FacilityRef>(sql`
        SELECT f.id, f.code, f.name FROM facilities f
        WHERE f.type <> 'DISPOSAL_SITE' AND f.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.facility_id = f.id AND u.active
                          AND u.phone_verified AND u.receives_pickup_otp
                          AND u.role IN ('hospital_admin', 'hospital_staff'))
        ORDER BY f.name LIMIT 100`),
    rows<{ id: string; waste_code: string; facility_name: string; days: number }>(sql`
        SELECT w.id, w.waste_code, f.name AS facility_name,
               (${t}::date - (w.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date) AS days
        FROM waste_records w JOIN facilities f ON f.id = w.facility_id
        WHERE w.status = 'REGISTERED' AND w.created_at < now() - make_interval(days => ${overdueDays})
        ORDER BY w.created_at LIMIT 50`),
    rows<{ id: string; plate_no: string; trip_code: string; last_seen: Date | null }>(sql`
        SELECT v.id, v.plate_no, t.trip_code,
               (SELECT max(g.recorded_at) FROM gps_events g WHERE g.vehicle_id = v.id) AS last_seen
        FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.status = 'IN_PROGRESS'
          AND NOT EXISTS (SELECT 1 FROM gps_events g WHERE g.vehicle_id = v.id
                          AND g.recorded_at >= now() - make_interval(mins => ${silentMinutes}))
        ORDER BY v.plate_no LIMIT 10`),
    rows<{
      id: string;
      channel: string;
      template: string;
      last_error: string | null;
      at: Date;
    }>(sql`
        SELECT id, channel, template, last_error, updated_at AS at FROM outbox_messages
        WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 50`),
    rows<{
      id: string;
      invoice_no: string;
      facility_name: string;
      due_date: string;
      total: string;
    }>(sql`
        SELECT i.id, i.invoice_no, f.name AS facility_name, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
               i.total_santim AS total
        FROM invoices i JOIN facilities f ON f.id = i.facility_id
        WHERE i.status = 'ISSUED' AND i.due_date < ${t}::date
        ORDER BY i.due_date LIMIT 100`),
    rows<{
      id: string;
      subject: string;
      kind: string;
      number: string;
      expires_on: string;
      expired: boolean;
    }>(sql`
        SELECT l.id, l.kind, l.number, to_char(l.expires_on, 'YYYY-MM-DD') AS expires_on,
               (l.expires_on < ${t}::date) AS expired,
               coalesce(
                 (SELECT v.plate_no FROM vehicles v WHERE l.subject_type = 'VEHICLE' AND v.id = l.subject_id),
                 (SELECT u.full_name FROM drivers d JOIN users u ON u.id = d.user_id
                    WHERE l.subject_type = 'DRIVER' AND d.id = l.subject_id),
                 (SELECT f.name FROM facilities f
                    WHERE l.subject_type IN ('FACILITY', 'SITE') AND f.id = l.subject_id),
                 l.subject_type::text) AS subject
        FROM licenses l
        WHERE l.expires_on <= ${t}::date + ${licenceDays}::int
        ORDER BY l.expires_on LIMIT 50`),
    rows<{
      id: string;
      code: string;
      kind: AdminAlerts["disposalExceptions"][number]["kind"];
      facility_name: string;
      details: string | null;
      at: Date;
    }>(sql`
        SELECT * FROM (
          SELECT c.id, c.container_code AS code, c.status::text AS kind, f.name AS facility_name,
                 c.exception_reason AS details, c.updated_at AS at
          FROM containers c JOIN waste_records w ON w.id = c.waste_record_id JOIN facilities f ON f.id = w.facility_id
          WHERE c.status IN ('MISSING', 'REFUSED') AND c.updated_at >= now() - interval '30 days'
          UNION ALL
          SELECT w.id, w.waste_code, 'CLOSED_NO_DESTRUCTION', f.name,
                 (SELECT a.after ->> 'reason' FROM audit_logs a
                   WHERE a.entity_type = 'waste_record' AND a.entity_id = w.id::text
                     AND a.action = 'waste.closed_no_destruction'
                   ORDER BY a.seq DESC LIMIT 1),
                 w.updated_at
          FROM waste_records w JOIN facilities f ON f.id = w.facility_id
          WHERE w.status = 'CLOSED_NO_DESTRUCTION' AND w.updated_at >= now() - interval '30 days'
          UNION ALL
          SELECT cert.id, cert.certificate_no, 'CERTIFICATE_FAILED', f.name, cert.last_error, cert.updated_at
          FROM certificates cert
          JOIN disposal_records d ON d.id = cert.disposal_record_id
          JOIN waste_records w ON w.id = d.waste_record_id
          JOIN facilities f ON f.id = w.facility_id
          WHERE cert.status = 'FAILED'
        ) x
        ORDER BY at DESC LIMIT 50`),
  ]);
  return {
    overrides: overrides.map((o) => ({
      id: o.id,
      facilityName: o.facility_name,
      details: o.reason,
      at: new Date(o.at).toISOString(),
    })),
    vehiclesWithoutTracker: noTracker.map((v) => ({
      id: v.id,
      plateNumber: v.plate_no,
      model: v.model ?? "",
    })),
    uncontractedFacilities: uncontracted,
    facilitiesNotReady: notReady,
    overduePickups: overdue.map((w) => ({
      id: w.id,
      wasteCode: w.waste_code,
      facilityName: w.facility_name,
      daysWaiting: num(w.days),
    })),
    silentTrackers: silent.map((s) => ({
      id: s.id,
      plateNumber: s.plate_no,
      tripCode: s.trip_code,
      lastSeenAt: s.last_seen ? new Date(s.last_seen).toISOString() : null,
    })),
    failedMessages: failed.map((m) => ({
      id: m.id,
      channel: m.channel,
      template: m.template,
      lastError: m.last_error,
      at: new Date(m.at).toISOString(),
    })),
    overdueInvoices: overdueInv.map((i) => ({
      id: i.id,
      invoiceNo: i.invoice_no,
      facilityName: i.facility_name,
      dueDate: i.due_date,
      totalSantim: num(i.total),
    })),
    disposalExceptions: disposalExceptions.map((d) => ({
      id: d.id,
      code: d.code,
      kind: d.kind,
      facilityName: d.facility_name,
      details: d.details,
      at: new Date(d.at).toISOString(),
    })),
    expiringLicences: licences.map((l) => ({
      id: l.id,
      subject: l.subject,
      kind: l.kind,
      number: l.number,
      expiresOn: l.expires_on,
      expired: l.expired,
    })),
  };
});

// ---------- 3.1 facilities and users ----------

type FacilityDbRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: FacilityRow["status"];
  region: string;
  address: string;
  city: string | null;
  sub_city: string | null;
  woreda: string | null;
  kebele: string | null;
  lat: number;
  lng: number;
  users_count: string;
  recipients: string;
  contract_status: FacilityRow["contractStatus"];
};

const FACILITY_SELECT = sql`
  SELECT f.id, f.code, f.name, f.type, f.status, f.region, f.address, f.city, f.sub_city, f.woreda, f.kebele,
         f.lat, f.lng,
         (SELECT count(*) FROM users u WHERE u.facility_id = f.id) AS users_count,
         (SELECT count(*) FROM users u WHERE u.facility_id = f.id AND u.active AND u.phone_verified
            AND u.receives_pickup_otp AND u.role IN ('hospital_admin', 'hospital_staff')) AS recipients,
         (SELECT ct.status FROM contracts ct WHERE ct.facility_id = f.id
            ORDER BY (ct.status <> 'EXPIRED') DESC, ct.end_date DESC LIMIT 1) AS contract_status
  FROM facilities f`;

function toFacilityRow(f: FacilityDbRow): FacilityRow {
  const otpRecipients = num(f.recipients);
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    type: f.type,
    status: f.status,
    region: f.region,
    address: f.address,
    usersCount: num(f.users_count),
    otpRecipients,
    contractStatus: f.contract_status,
    ready: f.type !== "DISPOSAL_SITE" && f.status === "ACTIVE" && otpRecipients > 0,
  };
}

export const getAdminFacilities = cache(async (): Promise<FacilityRow[]> => {
  await requireRole("super_admin");
  const result = await rows<FacilityDbRow>(sql`${FACILITY_SELECT} ORDER BY f.code LIMIT 500`);
  return result.map(toFacilityRow);
});

export const getAdminFacility = cache(async (code: string): Promise<FacilityDetail | null> => {
  await requireRole("super_admin");
  if (!/^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/.test(code)) return null;
  const [f] = await rows<FacilityDbRow>(sql`${FACILITY_SELECT} WHERE f.code = ${code} LIMIT 1`);
  if (!f) return null;
  return {
    ...toFacilityRow(f),
    city: f.city,
    subCity: f.sub_city,
    woreda: f.woreda,
    kebele: f.kebele,
    lat: Number(f.lat),
    lng: Number(f.lng),
  };
});

export const getAdminUsers = cache(async (): Promise<UserRow[]> => {
  await requireRole("super_admin");
  const result = await rows<UserDbRow>(sql`
    ${USER_SELECT} ORDER BY u.role NULLS FIRST, f.code NULLS FIRST, u.full_name LIMIT 500`);
  return result.map(toUserRow);
});

export const getAdminUser = cache(async (id: string): Promise<UserRow | null> => {
  await requireRole("super_admin");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [u] = await rows<UserDbRow>(sql`${USER_SELECT} WHERE u.id = ${id} LIMIT 1`);
  return u ? toUserRow(u) : null;
});

// ---------- 3.2 fleet ----------

export const getAdminFleet = cache(async (): Promise<FleetData> => {
  await requireRole("super_admin");
  const warningDays = await getSetting("license_expiry_warning_days");
  const t = today();
  const stateOf = (minExpiry: string | null): LicenceState => {
    if (!minExpiry) return "NONE";
    if (minExpiry < t) return "EXPIRED";
    const days = (Date.parse(minExpiry) - Date.parse(t)) / 86_400_000;
    return days <= warningDays ? "EXPIRING" : "VALID";
  };
  const [vehiclesRows, driverRows, trackerRows, licenceRows, candidates] = await Promise.all([
    rows<{
      id: string;
      plate_no: string;
      model: string | null;
      capacity_kg: string;
      status: FleetData["vehicles"][number]["status"];
      device_id: string | null;
      min_expiry: string | null;
    }>(sql`
      SELECT v.id, v.plate_no, v.model, v.capacity_kg, v.status,
             (SELECT d.device_id FROM tracker_devices d WHERE d.vehicle_id = v.id AND d.active LIMIT 1) AS device_id,
             (SELECT to_char(min(x.expires_on), 'YYYY-MM-DD') FROM (
                SELECT DISTINCT ON (l.kind) l.expires_on FROM licenses l
                WHERE l.subject_type = 'VEHICLE' AND l.subject_id = v.id ORDER BY l.kind, l.expires_on DESC) x) AS min_expiry
      FROM vehicles v WHERE v.active ORDER BY v.plate_no LIMIT 100`),
    rows<{
      id: string;
      name: string;
      license_no: string;
      status: FleetData["drivers"][number]["status"];
      plate_no: string | null;
      min_expiry: string | null;
    }>(sql`
      SELECT d.id, u.full_name AS name, d.license_no, d.status, v.plate_no,
             (SELECT to_char(min(x.expires_on), 'YYYY-MM-DD') FROM (
                SELECT DISTINCT ON (l.kind) l.expires_on FROM licenses l
                WHERE l.subject_type = 'DRIVER' AND l.subject_id = d.id ORDER BY l.kind, l.expires_on DESC) x) AS min_expiry
      FROM drivers d JOIN users u ON u.id = d.user_id LEFT JOIN vehicles v ON v.id = d.default_vehicle_id
      ORDER BY u.full_name LIMIT 100`),
    rows<{
      id: string;
      device_id: string;
      plate_no: string | null;
      active: boolean;
      last_seen_at: Date | null;
    }>(sql`
      SELECT t.id, t.device_id, v.plate_no, t.active, t.last_seen_at
      FROM tracker_devices t LEFT JOIN vehicles v ON v.id = t.vehicle_id ORDER BY t.device_id LIMIT 100`),
    rows<{
      id: string;
      subject_type: string;
      subject: string;
      kind: string;
      number: string;
      expires_on: string;
    }>(sql`
      SELECT l.id, l.subject_type, l.kind, l.number, to_char(l.expires_on, 'YYYY-MM-DD') AS expires_on,
             coalesce(
               (SELECT v.plate_no FROM vehicles v WHERE l.subject_type = 'VEHICLE' AND v.id = l.subject_id),
               (SELECT u.full_name FROM drivers d JOIN users u ON u.id = d.user_id
                  WHERE l.subject_type = 'DRIVER' AND d.id = l.subject_id),
               (SELECT f.name FROM facilities f WHERE l.subject_type IN ('FACILITY', 'SITE') AND f.id = l.subject_id),
               l.subject_type::text) AS subject
      FROM licenses l ORDER BY l.expires_on LIMIT 200`),
    rows<{ id: string; name: string }>(sql`
      SELECT u.id, u.full_name AS name FROM users u
      WHERE u.role = 'driver' AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.user_id = u.id)
      ORDER BY u.full_name LIMIT 100`),
  ]);
  return {
    vehicles: vehiclesRows.map((v) => ({
      id: v.id,
      plateNo: v.plate_no,
      model: v.model,
      capacityKg: num(v.capacity_kg),
      status: v.status,
      trackerDeviceId: v.device_id,
      licence: stateOf(v.min_expiry),
    })),
    drivers: driverRows.map((d) => ({
      id: d.id,
      name: d.name,
      licenseNo: d.license_no,
      status: d.status,
      defaultVehiclePlate: d.plate_no,
      licence: stateOf(d.min_expiry),
    })),
    trackers: trackerRows.map((tr) => ({
      id: tr.id,
      deviceId: tr.device_id,
      vehiclePlate: tr.plate_no,
      active: tr.active,
      lastSeenAt: tr.last_seen_at ? new Date(tr.last_seen_at).toISOString() : null,
    })),
    licences: licenceRows.map((l) => ({
      id: l.id,
      subjectType: l.subject_type,
      subject: l.subject,
      kind: l.kind,
      number: l.number,
      expiresOn: l.expires_on,
      state: stateOf(l.expires_on) as Exclude<LicenceState, "NONE">,
    })),
    driverCandidates: candidates,
    warningDays,
  };
});

// ---------- 3.3 trips ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Facilities with waste waiting for pickup, oldest first (CLAUDE.md §6: overdue after overdue_pickup_days). */
export const getAdminWaitingList = cache(async (): Promise<WaitingFacility[]> => {
  await requireRole("super_admin");
  const overdueDays = await getSetting("overdue_pickup_days");
  const t = today();
  const result = await rows<{
    id: string;
    code: string;
    name: string;
    status: string;
    recipients: number;
    waste: string;
    containers: string;
    kg: string;
    oldest_days: number;
  }>(sql`
    SELECT f.id, f.code, f.name, f.status,
           (SELECT count(*)::int FROM users u WHERE u.facility_id = f.id AND u.active AND u.phone_verified
              AND u.receives_pickup_otp AND u.role IN ('hospital_admin', 'hospital_staff')) AS recipients,
           count(w.id) AS waste, sum(w.container_count) AS containers, sum(w.weight_kg) AS kg,
           (${t}::date - min((w.created_at AT TIME ZONE 'Africa/Addis_Ababa')::date)) AS oldest_days
    FROM waste_records w JOIN facilities f ON f.id = w.facility_id
    WHERE w.status = 'REGISTERED'
      AND NOT EXISTS (SELECT 1 FROM trip_stop_waste l WHERE l.waste_record_id = w.id AND l.active)
    GROUP BY f.id
    ORDER BY min(w.created_at)
    LIMIT 200`);
  return result.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    ready: f.status === "ACTIVE" && f.recipients > 0,
    wasteCount: num(f.waste),
    containers: num(f.containers),
    kg: round2(f.kg),
    oldestDays: num(f.oldest_days),
    overdue: num(f.oldest_days) > overdueDays,
  }));
});

export const getAdminTripPlanningOptions = cache(async (): Promise<TripPlanningOptions> => {
  await requireRole("super_admin");
  const fleet = await getAdminFleet();
  return {
    vehicles: fleet.vehicles
      .filter((v) => v.status !== "MAINTENANCE" && v.status !== "OFFLINE")
      .map((v) => ({ id: v.id, plateNo: v.plateNo, status: v.status, licence: v.licence })),
    drivers: fleet.drivers.map((d) => ({ id: d.id, name: d.name, licence: d.licence })),
    maxStops: await getSetting("max_trip_stops"),
    today: today(),
  };
});

type TripListDbRow = {
  id: string;
  trip_code: string;
  planned_date: string;
  status: TripListRow["status"];
  plate_no: string;
  driver_name: string;
  stops_done: string;
  stops_total: string;
  vehicle_id: string;
  driver_id: string;
  started_at: Date | null;
  completed_at: Date | null;
  cancel_reason: string | null;
};

const TRIP_LIST_SELECT = sql`
  SELECT t.id, t.trip_code, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date, t.status, v.plate_no,
         u.full_name AS driver_name, t.vehicle_id, t.driver_id, t.started_at, t.completed_at, t.cancel_reason,
         (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id
            AND s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE', 'SKIPPED')) AS stops_done,
         (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id) AS stops_total
  FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
  JOIN drivers d ON d.id = t.driver_id JOIN users u ON u.id = d.user_id`;

const toTripListRow = (r: TripListDbRow): TripListRow => ({
  id: r.id,
  tripCode: r.trip_code,
  plannedDate: r.planned_date,
  status: r.status,
  vehiclePlate: r.plate_no,
  driverName: r.driver_name,
  stopsDone: num(r.stops_done),
  stopsTotal: num(r.stops_total),
});

/** Open trips and those of the last 14 days, newest first. */
export const getAdminTrips = cache(async (): Promise<TripListRow[]> => {
  await requireRole("super_admin");
  const result = await rows<TripListDbRow>(sql`
    ${TRIP_LIST_SELECT}
    WHERE t.status IN ('PLANNED', 'IN_PROGRESS') OR t.planned_date >= ${today()}::date - 14
    ORDER BY t.planned_date DESC, t.trip_code DESC
    LIMIT 100`);
  return result.map(toTripListRow);
});

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export const getAdminTripDetail = cache(async (tripId: string): Promise<TripDetail | null> => {
  await requireRole("super_admin");
  if (!UUID_RE.test(tripId)) return null;
  const [t] = await rows<TripListDbRow>(sql`${TRIP_LIST_SELECT} WHERE t.id = ${tripId} LIMIT 1`);
  if (!t) return null;
  const stops = await rows<{
    id: string;
    priority_order: number;
    facility_id: string;
    code: string;
    name: string;
    status: TripDetailStop["status"];
    collection_method: TripDetailStop["collectionMethod"];
    arrived_at: Date | null;
    completed_at: Date | null;
    arrival_distance_m: number | null;
    geofence_ok: boolean | null;
    skip_reason: string | null;
    override_reason: string | null;
    expected: string;
    scanned: string;
    waste_codes: string[] | null;
  }>(sql`
    SELECT s.id, s.priority_order, f.id AS facility_id, f.code, f.name, s.status, s.collection_method,
           s.arrived_at, s.completed_at, s.arrival_distance_m, s.geofence_ok, s.skip_reason, s.override_reason,
           (SELECT count(*) FROM trip_stop_waste l JOIN containers c ON c.waste_record_id = l.waste_record_id
              WHERE l.trip_stop_id = s.id AND l.active) AS expected,
           (SELECT count(*) FROM handovers h WHERE h.trip_stop_id = s.id AND h.status = 'SCANNED') AS scanned,
           (SELECT array_agg(w.waste_code ORDER BY w.waste_code) FROM trip_stop_waste l
              JOIN waste_records w ON w.id = l.waste_record_id WHERE l.trip_stop_id = s.id) AS waste_codes
    FROM trip_stops s JOIN facilities f ON f.id = s.facility_id
    WHERE s.trip_id = ${tripId} ORDER BY s.priority_order LIMIT 50`);
  return {
    ...toTripListRow(t),
    vehicleId: t.vehicle_id,
    driverId: t.driver_id,
    startedAt: iso(t.started_at),
    completedAt: iso(t.completed_at),
    cancelReason: t.cancel_reason,
    stops: stops.map((s) => ({
      id: s.id,
      order: s.priority_order,
      facility: { id: s.facility_id, code: s.code, name: s.name },
      status: s.status,
      collectionMethod: s.collection_method,
      arrivedAt: iso(s.arrived_at),
      completedAt: iso(s.completed_at),
      distanceM: s.arrival_distance_m,
      geofenceOk: s.geofence_ok,
      skipReason: s.skip_reason,
      overrideReason: s.override_reason,
      expectedContainers: num(s.expected),
      scannedContainers: num(s.scanned),
      wasteCodes: s.waste_codes ?? [],
    })),
  };
});

/** Certificates of every status, newest first (super_admin: revoke / reissue, failed generation). */
export const getAdminCertificates = cache(async (): Promise<AdminCertificateRow[]> => {
  await requireRole("super_admin");
  const result = await rows<{
    id: string;
    certificate_no: string;
    status: AdminCertificateRow["status"];
    facility_name: string;
    waste_code: string;
    issued_at: Date | null;
    generation_attempts: number;
    last_error: string | null;
    revoked_reason: string | null;
  }>(sql`
    SELECT cert.id, cert.certificate_no, cert.status, f.name AS facility_name, w.waste_code, cert.issued_at,
           cert.generation_attempts, cert.last_error, cert.revoked_reason
    FROM certificates cert
    JOIN disposal_records d ON d.id = cert.disposal_record_id
    JOIN waste_records w ON w.id = d.waste_record_id
    JOIN facilities f ON f.id = w.facility_id
    ORDER BY (cert.status IN ('PENDING', 'FAILED')) DESC, cert.created_at DESC
    LIMIT 100`);
  return result.map((c) => ({
    id: c.id,
    certificateNo: c.certificate_no,
    status: c.status,
    facilityName: c.facility_name,
    wasteCode: c.waste_code,
    issuedOn: c.issued_at ? toEatDateString(c.issued_at) : null,
    attempts: num(c.generation_attempts),
    lastError: c.last_error,
    revokedReason: c.revoked_reason,
  }));
});
