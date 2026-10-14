import type { PoolClient } from "@neondatabase/serverless";
import { afterAll, describe, expect, it } from "vitest";
import {
  closeTestPool,
  inRolledBackTransaction,
  insertFacility,
  insertUser,
  testPool,
  violation,
} from "./db";

afterAll(closeTestPool);

/** Ids of seeded rows (npm run db:seed) used as fixtures. */
/**
 * Reference rows from the seed, plus fresh facilities, vehicles and a driver created inside the rolled-back
 * transaction — so these tests never collide with the seeded demo data (trips in progress, contracts, trackers).
 */
async function fixtures(c: PoolClient) {
  const one = async (q: string, p: unknown[] = []) => (await c.query(q, p)).rows[0]?.id as string;
  const vehicle = (plate: string) =>
    one(`INSERT INTO vehicles (plate_no, capacity_kg) VALUES ($1, 1000) RETURNING id`, [plate]);
  const driverUser = await insertUser(c, { role: "driver" });
  return {
    hospital: await insertFacility(c, "TS-TST-901", "GENERAL_HOSPITAL"),
    hospital2: await insertFacility(c, "TS-TST-902", "CLINIC"),
    site: await one(`SELECT id FROM facilities WHERE code = 'DD-DIS-018'`),
    category: await one(`SELECT id FROM waste_categories WHERE code = 'INFECTIOUS'`),
    method: await one(`SELECT id FROM destruction_methods WHERE code = 'HIGH_TEMP_INCINERATION'`),
    staff: await one(`SELECT id FROM users WHERE clerk_user_id = 'dev_hospital_staff'`),
    admin: await one(`SELECT id FROM users WHERE clerk_user_id = 'dev_super_admin'`),
    operator: await one(`SELECT id FROM users WHERE clerk_user_id = 'dev_disposal_operator'`),
    driverUser,
    driver: await one(`INSERT INTO drivers (user_id, license_no) VALUES ($1, $2) RETURNING id`, [
      driverUser,
      `TEST-LIC-${driverUser.slice(-8)}`,
    ]),
    vehicle: await vehicle(`TEST-${driverUser.slice(-6)}-A`),
    vehicle2: await vehicle(`TEST-${driverUser.slice(-6)}-B`),
  };
}
type F = Awaited<ReturnType<typeof fixtures>>;

const WASTE = `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status, cancel_reason, cancelled_at)
  VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::waste_status, 'REGISTERED'), $8, $9) RETURNING id`;

async function waste(c: PoolClient, f: F, code: string, count = 2): Promise<string> {
  const { rows } = await c.query(WASTE, [
    code,
    f.hospital,
    f.category,
    count,
    12.5,
    f.staff,
    null,
    null,
    null,
  ]);
  return rows[0].id;
}

async function trip(
  c: PoolClient,
  f: F,
  code: string,
  status = "PLANNED",
  vehicle?: string
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
     VALUES ($1, $2, $3, '2026-10-09', $4::trip_status, CASE WHEN $4::trip_status IN ('IN_PROGRESS','COMPLETED') THEN now() END) RETURNING id`,
    [code, vehicle ?? f.vehicle, f.driver, status]
  );
  return rows[0].id;
}

async function stop(c: PoolClient, tripId: string, facility: string, order = 1): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO trip_stops (trip_id, facility_id, priority_order) VALUES ($1, $2, $3) RETURNING id`,
    [tripId, facility, order]
  );
  return rows[0].id;
}

describe("migrations and seed", () => {
  it("has all 29 tables (25 + 4 of Gate 8), the reference data and the 18 default settings", async () => {
    const { rows } = await testPool().query(`
      SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tables,
             (SELECT count(*) FROM waste_categories)::int AS categories,
             (SELECT count(*) FROM destruction_methods)::int AS methods,
             (SELECT count(*) FROM settings)::int AS settings,
             (SELECT value FROM settings WHERE key = 'otp_expiry_minutes') AS otp_expiry,
             (SELECT value FROM settings WHERE key = 'vat_rate_percent') AS vat,
             (SELECT value FROM settings WHERE key = 'expiry_alert_days') AS expiry_days`);
    expect(rows[0]).toEqual({
      tables: 29,
      categories: 6,
      methods: 5,
      settings: 18,
      otp_expiry: 10,
      vat: 15,
      expiry_days: [90, 30, 7],
    });
  });
});

describe("waste records and containers", () => {
  it("needs ≥ 1 container, weight > 0, a WR- code and a health facility", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const p = (o: Partial<Record<string, unknown>>) => [
        o.code ?? "WR-2610-90001",
        o.facility ?? f.hospital,
        f.category,
        o.count ?? 1,
        o.weight ?? 5,
        f.staff,
        null,
        null,
        null,
      ];
      expect(await violation(c, WASTE, p({ count: 0 }))).toBe("waste_records_container_count_min");
      expect(await violation(c, WASTE, p({ weight: 0 }))).toBe("waste_records_weight_positive");
      expect(await violation(c, WASTE, p({ code: "WST-1" }))).toBe("waste_records_code_format");
      expect(await violation(c, WASTE, p({ facility: f.site }))).toBe(
        "waste_records_health_facility"
      );
      expect(await violation(c, WASTE, p({}))).toBe("NO_ERROR");
      expect(await violation(c, WASTE, p({}))).toBe("waste_records_waste_code_unique");
    }));

  it("CANCELLED needs a reason and a time (and only then)", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const base = ["WR-2610-90002", f.hospital, f.category, 1, 5, f.staff];
      expect(await violation(c, WASTE, [...base, "CANCELLED", null, null])).toBe(
        "waste_records_cancel_reason"
      );
      expect(await violation(c, WASTE, [...base, "REGISTERED", "why", "now()"])).toBe(
        "waste_records_cancel_reason"
      );
      expect(
        await violation(c, WASTE, [...base, "CANCELLED", "Registered twice", new Date()])
      ).toBe("NO_ERROR");
    }));

  it("container codes follow the waste code, stay within container_count, and exceptions need a reason", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const w = await waste(c, f, "WR-2610-90003", 2);
      const ins = `INSERT INTO containers (container_code, waste_record_id, seq_no, status, exception_reason)
                   VALUES ($1, $2, $3, COALESCE($4::container_status, 'LABELLED'), $5)`;
      expect(await violation(c, ins, ["WR-2610-90003-C01", w, 1, null, null])).toBe("NO_ERROR");
      expect(await violation(c, ins, ["WR-2610-90003-C01", w, 1, null, null])).toMatch(
        /containers_(container_code|waste_record_seq)_unique/
      );
      expect(await violation(c, ins, ["WR-2610-90003-C03", w, 3, null, null])).toBe(
        "containers_seq_within_count"
      );
      expect(await violation(c, ins, ["WR-2610-99999-C02", w, 2, null, null])).toBe(
        "containers_code_matches_waste"
      );
      expect(await violation(c, ins, ["WR-2610-90003-C02", w, 2, "MISSING", null])).toBe(
        "containers_exception_reason"
      );
      expect(
        await violation(c, ins, ["WR-2610-90003-C02", w, 2, "MISSING", "Not on the truck"])
      ).toBe("NO_ERROR");
    }));
});

describe("trips, stops and pickup evidence", () => {
  it("one IN_PROGRESS trip per vehicle and per driver; cancel needs a reason", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      await trip(c, f, "TR-990101-01", "IN_PROGRESS");
      const ins = `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at, cancel_reason, cancelled_at)
                   VALUES ($1, $2, $3, '2026-10-09', $4, now(), $5, $6)`;
      expect(
        await violation(c, ins, ["TR-990101-02", f.vehicle, f.driver, "IN_PROGRESS", null, null])
      ).toMatch(/trips_one_active_per_(vehicle|driver)/);
      expect(
        await violation(c, ins, ["TR-990101-03", f.vehicle2, f.driver, "IN_PROGRESS", null, null])
      ).toBe("trips_one_active_per_driver");
      expect(
        await violation(c, ins, ["TR-990101-04", f.vehicle2, f.driver, "CANCELLED", null, null])
      ).toBe("trips_cancel_reason");
      expect(await violation(c, ins, ["TRP-1", f.vehicle2, f.driver, "PLANNED", null, null])).toBe(
        "trips_code_format"
      );
    }));

  it("stops: unique order, health facility only, completion fields, override and skip reasons", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const t = await trip(c, f, "TR-990101-11");
      const s = await stop(c, t, f.hospital, 1);
      expect(
        await violation(
          c,
          `INSERT INTO trip_stops (trip_id, facility_id, priority_order) VALUES ($1, $2, 1)`,
          [t, f.hospital2]
        )
      ).toBe("trip_stops_trip_order_unique");
      expect(
        await violation(
          c,
          `INSERT INTO trip_stops (trip_id, facility_id, priority_order) VALUES ($1, $2, 2)`,
          [t, f.site]
        )
      ).toBe("trip_stops_health_facility");
      const upd = (sql: string) => violation(c, `UPDATE trip_stops SET ${sql} WHERE id = $1`, [s]);
      expect(await upd(`status = 'COLLECTED', arrived_at = now()`)).toBe(
        "trip_stops_collection_fields"
      );
      expect(
        await upd(
          `status = 'COLLECTED_OVERRIDE', arrived_at = now(), completed_at = now(), collection_method = 'OVERRIDE', confirmed_by = '${f.admin}'`
        )
      ).toBe("trip_stops_override");
      expect(
        await upd(
          `status = 'COLLECTED', arrived_at = now(), completed_at = now(), collection_method = 'OVERRIDE', confirmed_by = '${f.admin}', override_reason = 'x'`
        )
      ).toMatch(/trip_stops_(override|collected_method)/);
      expect(await upd(`status = 'SKIPPED'`)).toBe("trip_stops_skip_reason");
      expect(await upd(`status = 'SKIPPED', skip_reason = 'Gate closed'`)).toBe("NO_ERROR");
    }));

  it("a waste record can be on only one active stop; unlinking frees it", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const w = await waste(c, f, "WR-2610-90004", 1);
      const s1 = await stop(c, await trip(c, f, "TR-990101-21"), f.hospital);
      const s2 = await stop(c, await trip(c, f, "TR-990101-22", "PLANNED", f.vehicle2), f.hospital);
      const link = `INSERT INTO trip_stop_waste (trip_stop_id, waste_record_id) VALUES ($1, $2)`;
      expect(await violation(c, link, [s1, w])).toBe("NO_ERROR");
      expect(await violation(c, link, [s2, w])).toBe("trip_stop_waste_one_active_stop");
      await c.query(`UPDATE trip_stop_waste SET active = false WHERE trip_stop_id = $1`, [s1]);
      expect(await violation(c, link, [s2, w])).toBe("NO_ERROR");
    }));

  it("one ISSUED OTP per stop, hash only; one scan per container per stop", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const s = await stop(c, await trip(c, f, "TR-990101-31"), f.hospital);
      const otp = `INSERT INTO otp_codes (trip_stop_id, code_hash, recipient_count, expires_at) VALUES ($1, $2, 1, now() + interval '10 minutes')`;
      const hash = "a".repeat(64);
      expect(await violation(c, otp, [s, hash])).toBe("NO_ERROR");
      expect(await violation(c, otp, [s, hash])).toBe("otp_codes_one_issued_per_stop");
      expect(await violation(c, otp, [s, "123456"])).toMatch(
        /otp_codes_(hash_filled|one_issued_per_stop)/
      );

      const w = await waste(c, f, "WR-2610-90005", 1);
      const { rows } = await c.query(
        `INSERT INTO containers (container_code, waste_record_id, seq_no) VALUES ('WR-2610-90005-C01', $1, 1) RETURNING id`,
        [w]
      );
      const scan = `INSERT INTO handovers (trip_stop_id, container_id, driver_id) VALUES ($1, $2, $3)`;
      expect(await violation(c, scan, [s, rows[0].id, f.driver])).toBe("NO_ERROR");
      expect(await violation(c, scan, [s, rows[0].id, f.driver])).toBe(
        "handovers_stop_container_unique"
      );
    }));
});

describe("fleet and tracking", () => {
  it("a driver profile needs a user with the driver role, who then keeps that role", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      expect(
        await violation(c, `INSERT INTO drivers (user_id, license_no) VALUES ($1, 'LIC-TEST-1')`, [
          f.staff,
        ])
      ).toBe("drivers_user_is_driver");
      expect(
        await violation(c, `UPDATE users SET role = 'efda_officer' WHERE id = $1`, [f.driverUser])
      ).toBe("drivers_user_is_driver");
    }));

  it("GPS points are unique per device and time, with valid coordinates", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const { rows } = await c.query(
        `INSERT INTO tracker_devices (device_id, vehicle_id, token_hash) VALUES ('TEST-DEV-1', $1, $2) RETURNING id`,
        [f.vehicle2, "b".repeat(64)]
      );
      const ins = `INSERT INTO gps_events (device_id, vehicle_id, lat, lng, recorded_at) VALUES ($1, $2, $3, 41.8, '2026-10-09T08:00:00Z')`;
      expect(await violation(c, ins, [rows[0].id, f.vehicle2, 9.6])).toBe("NO_ERROR");
      expect(await violation(c, ins, [rows[0].id, f.vehicle2, 9.6])).toBe(
        "gps_events_device_recorded_unique"
      );
      expect(
        await violation(
          c,
          `INSERT INTO gps_events (device_id, vehicle_id, lat, lng, recorded_at) VALUES ($1, $2, 95, 41.8, now())`,
          [rows[0].id, f.vehicle2]
        )
      ).toBe("gps_events_lat_range");
    }));
});

describe("disposal and certificates", () => {
  async function disposal(c: PoolClient, f: F, code: string) {
    const w = await waste(c, f, code, 1);
    const { rows } = await c.query(
      `INSERT INTO disposal_records (waste_record_id, operator_id, received_at) VALUES ($1, $2, now()) RETURNING id`,
      [w, f.operator]
    );
    return { wasteId: w, id: rows[0].id as string };
  }

  it("only a disposal_operator records disposal; a locked record can never change or be deleted", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const w = await waste(c, f, "WR-2610-90006", 1);
      expect(
        await violation(
          c,
          `INSERT INTO disposal_records (waste_record_id, operator_id) VALUES ($1, $2)`,
          [w, f.staff]
        )
      ).toBe("disposal_records_operator_role");

      const d = await disposal(c, f, "WR-2610-90007");
      expect(
        await violation(c, `UPDATE disposal_records SET locked = true WHERE id = $1`, [d.id])
      ).toBe("disposal_records_locked_needs_destruction");
      expect(
        await violation(
          c,
          `UPDATE disposal_records SET locked = true, destroyed_at = now(), method_id = $2 WHERE id = $1`,
          [d.id, f.method]
        )
      ).toBe("NO_ERROR");
      expect(
        await violation(c, `UPDATE disposal_records SET received_at = now() WHERE id = $1`, [d.id])
      ).toBe("disposal_records_locked");
      expect(await violation(c, `DELETE FROM disposal_records WHERE id = $1`, [d.id])).toBe(
        "disposal_records_locked"
      );
    }));

  it("one current certificate per disposal; ISSUED needs file + hash; REVOKED needs a reason", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const d = await disposal(c, f, "WR-2610-90008");
      const ins = `INSERT INTO certificates (certificate_no, disposal_record_id, verify_token, status, file_key, sha256, issued_at, revoked_reason, revoked_at)
                   VALUES ($1, $2, $3, COALESCE($4::certificate_status, 'PENDING'), $5, $6, $7, $8, $9)`;
      const token = (n: number) => `tok_${String(n).padStart(24, "0")}`;
      expect(
        await violation(c, ins, [
          "CD-2026-90001",
          d.id,
          token(1),
          null,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("NO_ERROR");
      expect(
        await violation(c, ins, [
          "CD-2026-90002",
          d.id,
          token(2),
          null,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("certificates_one_current_per_disposal");
      const d2 = await disposal(c, f, "WR-2610-90009");
      expect(
        await violation(c, ins, [
          "CD-2026-90003",
          d2.id,
          token(3),
          "ISSUED",
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("certificates_issued_fields");
      expect(
        await violation(c, ins, [
          "CD-2026-90004",
          d2.id,
          token(4),
          "REVOKED",
          "k",
          "c".repeat(64),
          new Date(),
          null,
          null,
        ])
      ).toBe("certificates_revoked_fields");
      expect(
        await violation(c, ins, ["CERT-1", d2.id, token(5), null, null, null, null, null, null])
      ).toBe("certificates_no_format");
    }));
});

describe("contracts and invoices", () => {
  async function contract(
    c: PoolClient,
    facility: string,
    code: string,
    start: string,
    end: string
  ) {
    return violation(
      c,
      `INSERT INTO contracts (contract_code, facility_id, start_date, end_date, monthly_fee_santim) VALUES ($1, $2, $3, $4, 500000)`,
      [code, facility, start, end]
    );
  }

  it("contracts of one facility may not overlap; codes are CT-YYYY-NNNN", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      expect(await contract(c, f.hospital, "CT-2026-9001", "2026-01-01", "2027-01-01")).toBe(
        "NO_ERROR"
      );
      expect(await contract(c, f.hospital, "CT-2026-9002", "2026-06-01", "2027-06-01")).toBe(
        "contracts_no_overlap"
      );
      expect(await contract(c, f.hospital, "CT-2027-9003", "2027-01-01", "2028-01-01")).toBe(
        "NO_ERROR"
      );
      expect(await contract(c, f.hospital2, "CTR-2025-DD01", "2026-01-01", "2027-01-01")).toBe(
        "contracts_code_format"
      );
    }));

  it("invoices: total = subtotal + VAT, one per month, same facility as the contract, settlement needs a reference", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      await contract(c, f.hospital, "CT-2026-9101", "2026-01-01", "2027-01-01");
      const ct = (await c.query(`SELECT id FROM contracts WHERE contract_code = 'CT-2026-9101'`))
        .rows[0].id;
      const ins = `INSERT INTO invoices (invoice_no, contract_id, facility_id, period_start, period_end, subtotal_santim, vat_rate_percent, vat_santim, total_santim, status, issued_at, due_date, settled_at, settlement_ref)
                   VALUES ($1, $2, $3, '2026-09-01', '2026-09-30', 500000, 15, 75000, $4, COALESCE($5::invoice_status, 'DRAFT'), $6, $7, $8, $9)`;
      expect(
        await violation(c, ins, [
          "INV-2026-09-9001",
          ct,
          f.hospital,
          500000,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("invoices_total_sum");
      expect(
        await violation(c, ins, [
          "INV-2026-09-9002",
          ct,
          f.hospital2,
          575000,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("invoices_facility_matches_contract");
      expect(
        await violation(c, ins, [
          "INV-2026-09-9003",
          ct,
          f.hospital,
          575000,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("NO_ERROR");
      expect(
        await violation(c, ins, [
          "INV-2026-09-9004",
          ct,
          f.hospital,
          575000,
          null,
          null,
          null,
          null,
          null,
        ])
      ).toBe("invoices_contract_period_unique");
      await c.query(`DELETE FROM invoices WHERE invoice_no = 'INV-2026-09-9003'`);
      expect(
        await violation(c, ins, [
          "INV-2026-09-9005",
          ct,
          f.hospital,
          575000,
          "SETTLED_OFFLINE",
          new Date(),
          "2026-10-31",
          new Date(),
          null,
        ])
      ).toBe("invoices_settled_fields");
      expect(
        await violation(c, ins, [
          "INV-2026-09-9006",
          ct,
          f.hospital,
          575000,
          "ISSUED",
          new Date(),
          null,
          null,
          null,
        ])
      ).toBe("invoices_issued_fields");
    }));
});

describe("platform tables", () => {
  it("the audit log is append-only: no UPDATE, DELETE or TRUNCATE", () =>
    inRolledBackTransaction(async (c) => {
      await c.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, prev_hash, hash) VALUES ('test.event', 'test', 'x', $2, $1)`,
        ["d".repeat(64), "e".repeat(64)] // a prev_hash no real row has: the chain's first entry is unique
      );
      expect(
        await violation(c, `UPDATE audit_logs SET action = 'tampered' WHERE hash = $1`, [
          "d".repeat(64),
        ])
      ).toBe("audit_logs_append_only");
      expect(await violation(c, `DELETE FROM audit_logs WHERE hash = $1`, ["d".repeat(64)])).toBe(
        "audit_logs_append_only"
      );
      expect(await violation(c, `TRUNCATE audit_logs`)).toBe("audit_logs_append_only");
    }));

  it("idempotency keys are unique per user + route + key, also for system jobs (no user)", () =>
    inRolledBackTransaction(async (c) => {
      const f = await fixtures(c);
      const ins = `INSERT INTO idempotency_keys (key, user_id, route, request_hash) VALUES ($1, $2, '/api/stops/arrive', repeat('a', 64))`;
      expect(await violation(c, ins, ["key-00000001", f.staff])).toBe("NO_ERROR");
      expect(await violation(c, ins, ["key-00000001", f.staff])).toBe(
        "idempotency_keys_user_route_key_unique"
      );
      expect(await violation(c, ins, ["key-00000001", f.admin])).toBe("NO_ERROR");
      expect(await violation(c, ins, ["key-00000002", null])).toBe("NO_ERROR");
      expect(await violation(c, ins, ["key-00000002", null])).toBe(
        "idempotency_keys_user_route_key_unique"
      );
    }));

  it("a user insert helper still works with the new triggers in place", () =>
    inRolledBackTransaction(async (c) => {
      const id = await insertUser(c, { role: "super_admin" });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }));
});
