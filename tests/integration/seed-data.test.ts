import { afterAll, describe, expect, it } from "vitest";
import { verifyAuditChain } from "@/server/audit/verify";
import {
  certificateStatus,
  collectionMethod,
  containerStatus,
  contractStatus,
  invoiceStatus,
  otpStatus,
  stopStatus,
  tripStatus,
  wasteStatus,
} from "@/server/db/schema/enums";
import { closeTestPool, drizzleOn, testPool } from "./db";

/**
 * Gate 2.9: the committed seed data (npm run db:seed) satisfies the cross-table rules of CLAUDE.md §5–§6 that a
 * single-row constraint cannot check, and covers every status so each dashboard has something to show.
 */
afterAll(closeTestPool);

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];

/** Rows returned by a "violations" query must be empty. */
const none = async (sql: string) => expect(await q(sql)).toEqual([]);

describe("seed data covers every status (dashboards)", () => {
  const cases: [string, string, readonly string[]][] = [
    ["waste_records", "status", wasteStatus.enumValues],
    ["containers", "status", containerStatus.enumValues],
    ["trips", "status", tripStatus.enumValues],
    ["trip_stops", "status", stopStatus.enumValues],
    ["trip_stops", "collection_method", collectionMethod.enumValues],
    ["otp_codes", "status", otpStatus.enumValues],
    ["certificates", "status", certificateStatus.enumValues],
    ["invoices", "status", invoiceStatus.enumValues],
    ["contracts", "status", contractStatus.enumValues],
    ["handovers", "status", ["SCANNED", "CANCELLED"]],
  ];
  for (const [table, column, values] of cases) {
    it(`${table}.${column}: every value present`, async () => {
      const rows = await q<{ v: string }>(
        `SELECT DISTINCT ${column}::text AS v FROM ${table} WHERE ${column} IS NOT NULL`
      );
      expect(rows.map((r) => r.v).sort()).toEqual([...values].sort());
    });
  }

  // Seeded facilities have DD- codes; committed test fixtures on the test branch use other prefixes.
  it("has 18 facilities, 2 that are not ready (no OTP recipient), and an overdue waiting list", async () => {
    const [f] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM facilities WHERE code LIKE 'DD-%'`
    );
    expect(f.n).toBe(18);
    const notReady = await q<{ code: string }>(`
      SELECT f.code FROM facilities f
      WHERE f.type <> 'DISPOSAL_SITE' AND f.code LIKE 'DD-%' AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.facility_id = f.id AND u.active AND u.phone_verified AND u.receives_pickup_otp)
      ORDER BY 1`);
    expect(notReady.map((r) => r.code)).toEqual(["DD-CLI-009", "DD-CLI-017"]);
    const [overdue] = await q<{ n: number }>(`
      SELECT count(*)::int AS n FROM waste_records
      WHERE status = 'REGISTERED' AND created_at < now() - interval '7 days'`);
    expect(overdue.n).toBeGreaterThanOrEqual(1);
  });
});

describe("seed data satisfies the cross-table rules", () => {
  it("every waste record has exactly container_count containers", () =>
    none(`
      SELECT w.waste_code FROM waste_records w
      LEFT JOIN containers c ON c.waste_record_id = w.id
      GROUP BY w.id HAVING count(c.id) <> w.container_count`));

  it("container statuses match their waste status", () =>
    none(`
      SELECT w.waste_code, w.status, c.status AS container FROM waste_records w
      JOIN containers c ON c.waste_record_id = w.id
      WHERE NOT CASE w.status
        WHEN 'REGISTERED' THEN c.status = 'LABELLED'
        WHEN 'CANCELLED' THEN c.status = 'LABELLED'
        WHEN 'SCHEDULED' THEN c.status IN ('LABELLED', 'SCANNED_AT_PICKUP')
        -- during the check-in at the site (Gate 5) some containers may already be accounted for
        WHEN 'IN_TRANSIT' THEN c.status IN ('COLLECTED', 'RECEIVED', 'MISSING', 'REFUSED')
        WHEN 'RECEIVED' THEN c.status IN ('RECEIVED', 'MISSING', 'REFUSED')
        WHEN 'DISPOSED' THEN c.status = 'DESTROYED'
        WHEN 'DISPOSED_WITH_EXCEPTION' THEN c.status IN ('DESTROYED', 'MISSING', 'REFUSED')
        WHEN 'CLOSED_NO_DESTRUCTION' THEN c.status IN ('MISSING', 'REFUSED')
      END`));

  it("IN_TRANSIT waste still has a container on the truck (otherwise it is RECEIVED)", () =>
    none(`
      SELECT w.waste_code FROM waste_records w WHERE w.status = 'IN_TRANSIT'
      AND NOT EXISTS (SELECT 1 FROM containers c WHERE c.waste_record_id = w.id AND c.status = 'COLLECTED')`));

  it("DISPOSED_WITH_EXCEPTION has at least one destroyed container", () =>
    none(`
      SELECT w.waste_code FROM waste_records w WHERE w.status = 'DISPOSED_WITH_EXCEPTION'
      AND NOT EXISTS (SELECT 1 FROM containers c WHERE c.waste_record_id = w.id AND c.status = 'DESTROYED')`));

  it("SCHEDULED waste sits on an open stop of an open trip; REGISTERED/CANCELLED waste on none", () =>
    none(`
      SELECT w.waste_code, w.status FROM waste_records w
      LEFT JOIN trip_stop_waste l ON l.waste_record_id = w.id AND l.active
      LEFT JOIN trip_stops s ON s.id = l.trip_stop_id
      LEFT JOIN trips t ON t.id = s.trip_id
      WHERE (w.status = 'SCHEDULED' AND NOT (s.status IN ('PENDING', 'ARRIVED') AND t.status IN ('PLANNED', 'IN_PROGRESS')))
         OR (w.status IN ('REGISTERED', 'CANCELLED') AND l.id IS NOT NULL)`));

  it("waste picked up (IN_TRANSIT or later) came from a completed stop on its own facility", () =>
    none(`
      SELECT w.waste_code FROM waste_records w
      WHERE w.status NOT IN ('REGISTERED', 'SCHEDULED', 'CANCELLED')
      AND NOT EXISTS (
        SELECT 1 FROM trip_stop_waste l JOIN trip_stops s ON s.id = l.trip_stop_id
        WHERE l.waste_record_id = w.id AND l.active AND s.facility_id = w.facility_id
          AND s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE'))`));

  it("NO PARTIAL PICKUP: a completed stop has a scan for every container of its waste", () =>
    none(`
      SELECT s.id FROM trip_stops s
      JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
      JOIN containers c ON c.waste_record_id = l.waste_record_id
      WHERE s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE')
      AND NOT EXISTS (SELECT 1 FROM handovers h WHERE h.trip_stop_id = s.id AND h.container_id = c.id AND h.status = 'SCANNED')`));

  it("a SCANNED_AT_PICKUP container has a scan on an ARRIVED stop", () =>
    none(`
      SELECT c.container_code FROM containers c WHERE c.status = 'SCANNED_AT_PICKUP'
      AND NOT EXISTS (SELECT 1 FROM handovers h JOIN trip_stops s ON s.id = h.trip_stop_id
                      WHERE h.container_id = c.id AND h.status = 'SCANNED' AND s.status = 'ARRIVED')`));

  it("a COMPLETED trip has only final stops and every collected container accounted for at the site", () =>
    none(`
      SELECT t.trip_code FROM trips t
      JOIN trip_stops s ON s.trip_id = t.id
      LEFT JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
      LEFT JOIN containers c ON c.waste_record_id = l.waste_record_id
      WHERE t.status = 'COMPLETED'
        AND (s.status NOT IN ('COLLECTED', 'COLLECTED_OVERRIDE', 'SKIPPED')
             OR (l.id IS NOT NULL AND c.status NOT IN ('RECEIVED', 'MISSING', 'REFUSED', 'DESTROYED')))`));

  // At most one: an arrival at a facility without recipients issues no code (Gate 3 ASSUMPTION), and a resend
  // cancels the previous code first.
  it("cancelled trips have no collected stop; ARRIVED stops have at most one ISSUED OTP", async () => {
    await none(`
      SELECT t.trip_code FROM trips t JOIN trip_stops s ON s.trip_id = t.id
      WHERE t.status = 'CANCELLED' AND s.status NOT IN ('PENDING', 'SKIPPED')`);
    await none(`
      SELECT s.id FROM trip_stops s WHERE s.status = 'ARRIVED'
      AND (SELECT count(*) FROM otp_codes o WHERE o.trip_stop_id = s.id AND o.status = 'ISSUED') > 1`);
  });

  it("disposal: destroyed waste has a locked record; certificates only for destroyed waste", async () => {
    await none(`
      SELECT w.waste_code FROM waste_records w
      LEFT JOIN disposal_records d ON d.waste_record_id = w.id
      WHERE w.status IN ('DISPOSED', 'DISPOSED_WITH_EXCEPTION') AND NOT coalesce(d.locked, false)`);
    await none(`
      SELECT w.waste_code FROM waste_records w
      LEFT JOIN disposal_records d ON d.waste_record_id = w.id
      WHERE w.status IN ('RECEIVED', 'CLOSED_NO_DESTRUCTION') AND (d.id IS NULL OR d.locked)`);
    await none(`
      SELECT c.certificate_no FROM certificates c
      JOIN disposal_records d ON d.id = c.disposal_record_id
      JOIN waste_records w ON w.id = d.waste_record_id
      WHERE w.status NOT IN ('DISPOSED', 'DISPOSED_WITH_EXCEPTION')`);
  });

  it("invoices use the contract fee and the VAT setting; issued ones are due after invoice_due_days", async () => {
    await none(`
      SELECT i.invoice_no FROM invoices i JOIN contracts c ON c.id = i.contract_id
      WHERE i.subtotal_santim <> c.monthly_fee_santim
         OR i.vat_rate_percent <> (SELECT (value #>> '{}')::numeric FROM settings WHERE key = 'vat_rate_percent')
         OR i.vat_santim <> round(i.subtotal_santim * i.vat_rate_percent / 100)
         OR i.period_start < c.start_date OR i.period_start >= c.end_date`);
    await none(`
      SELECT invoice_no FROM invoices WHERE issued_at IS NOT NULL AND status IN ('ISSUED', 'SETTLED_OFFLINE')
      AND due_date <> ((issued_at AT TIME ZONE 'Africa/Addis_Ababa')::date
                       + (SELECT (value #>> '{}')::int FROM settings WHERE key = 'invoice_due_days'))`);
  });

  // Test fixtures write codes in the reserved period 99… (WR-99…, TR-99…), which real dates never reach.
  it("codes never run ahead of their counters (later codes cannot collide)", async () => {
    await none(`
      SELECT w.waste_code FROM waste_records w
      LEFT JOIN code_sequences s ON s.scope = 'waste' AND s.period = substr(w.waste_code, 4, 4)
      WHERE w.waste_code NOT LIKE 'WR-99%'
        AND (s.last_value IS NULL OR substr(w.waste_code, 9)::int > s.last_value)`);
    await none(`
      SELECT t.trip_code FROM trips t
      LEFT JOIN code_sequences s ON s.scope = 'trip' AND s.period = substr(t.trip_code, 4, 6)
      WHERE t.trip_code NOT LIKE 'TR-99%'
        AND (s.last_value IS NULL OR substr(t.trip_code, 11)::int > s.last_value)`);
  });

  it("the audit hash chain is intact (seed entries included)", async () => {
    const result = await verifyAuditChain(drizzleOn(testPool()));
    expect(result.ok).toBe(true);
    const [seed] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE request_id = 'seed'`
    );
    expect(seed.n).toBeGreaterThan(100);
  });
});
