import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toEatDateString } from "@/lib/dates";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import { unseal } from "@/server/outbox/seal";
import {
  arriveAtStop,
  confirmHandover,
  overrideStop,
  resendOtp,
  scanContainer,
  skipStop,
  startTrip,
  verifyOtp,
} from "@/server/services/pickup"; // vi.mock below is hoisted
import { cancelTrip, createTrip, reassignTrip } from "@/server/services/scheduling";
import { registerWasteTx } from "@/server/services/waste";
import { closeTestPool, inCommittedTransaction, testPool } from "./db";

/**
 * Gate 3.3–3.11: the pickup flow end to end through the services, on the Neon `test` branch (these commit).
 * Every test builds its own facility / vehicle / drivers / waste, so tests never share state. The session user
 * is a stub; OTP codes are read the way the SMS gateway would get them — from the (encrypted) outbox message.
 */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const meta = (key = randomUUID()) => ({ requestId: "test", idempotencyKey: key });
const as = (u: ActiveUser) => (session = u);
const today = toEatDateString(new Date());

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

let admin: ActiveUser;
let efda: ActiveUser;
let otherHospital: ActiveUser; // dev_hospital_admin of DD-REF-001
beforeAll(async () => {
  const users = await q<{
    clerk_user_id: string;
    id: string;
    role: Role;
    facility_id: string | null;
  }>(
    `SELECT clerk_user_id, id, role, facility_id FROM users WHERE clerk_user_id IN ('dev_super_admin', 'dev_efda_officer', 'dev_hospital_admin')`
  );
  const by = (k: string) => {
    const u = users.find((x) => x.clerk_user_id === k)!;
    return { id: u.id, role: u.role, facilityId: u.facility_id, active: true };
  };
  admin = by("dev_super_admin");
  efda = by("dev_efda_officer");
  otherHospital = by("dev_hospital_admin");
});
afterAll(closeTestPool);

let seq = 0;
// Unique across runs: committed fixtures stay on the test branch, so clock fragments alone would collide.
const tag = () => `${Date.now()}${++seq}`;
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

/** A fresh, isolated world: a ready facility with waste, a vehicle and two drivers. */
async function scenario(opts: { containers?: number; ready?: boolean; waste?: boolean } = {}) {
  const t = tag();
  const code = `PK-${letters()}-${String(randomInt(1000)).padStart(3, "0")}`;
  const [f] = await q<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'Test road', 9.6, 41.85) RETURNING id`,
    [code, `Pickup Test Clinic ${t}`]
  );
  const phone = `+2519${String(Date.now()).slice(-8)}`;
  const [hu] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email, phone_e164, phone_verified, receives_pickup_otp)
     VALUES ($1, 'hospital_admin', $2, 'Test Recipient', $3, $4, true, $5) RETURNING id`,
    [`test_h_${t}`, f.id, `h${t}@example.test`, phone, opts.ready !== false]
  );
  const hospital: ActiveUser = {
    id: hu.id,
    role: "hospital_admin",
    facilityId: f.id,
    active: true,
  };
  const [v] = await q<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg) VALUES ($1, 2000) RETURNING id`,
    [`T-${t}`]
  );
  const drivers: ActiveUser[] = [];
  const driverIds: string[] = [];
  for (const n of [1, 2]) {
    const [du] = await q<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'Test Driver', $2) RETURNING id`,
      [`test_d${n}_${t}`, `d${n}${t}@example.test`]
    );
    const [d] = await q<{ id: string }>(
      `INSERT INTO drivers (user_id, license_no) VALUES ($1, $2) RETURNING id`,
      [du.id, `TL-${n}-${t}`]
    );
    drivers.push({ id: du.id, role: "driver", facilityId: null, active: true });
    driverIds.push(d.id);
  }
  let containerCodes: string[] = [];
  if (opts.waste !== false) {
    const w = await inCommittedTransaction((tx) =>
      registerWasteTx(tx, hospital, {
        categoryCode: "SHARPS",
        containerCount: opts.containers ?? 2,
        weightKg: 4,
      })
    );
    containerCodes = w.containerCodes;
  }
  return {
    facilityCode: code,
    facilityId: f.id,
    hospital,
    phone,
    vehicleId: v.id,
    drivers,
    driverIds,
    containerCodes,
  };
}

async function planAndStart(s: Awaited<ReturnType<typeof scenario>>) {
  as(admin);
  const trip = await createTrip({
    plannedDate: today,
    vehicleId: s.vehicleId,
    driverId: s.driverIds[0],
    stops: [{ facilityCode: s.facilityCode }],
  });
  const [stop] = await q<{ id: string }>(`SELECT id FROM trip_stops WHERE trip_id = $1`, [trip.id]);
  as(s.drivers[0]);
  await startTrip(trip.id, meta());
  return { tripId: trip.id, stopId: stop.id };
}

/** The current pickup code, as the SMS gateway would read it from the outbox. */
async function currentCode(phone: string): Promise<string> {
  const [m] = await q<{ payload: { sealed?: string } }>(
    `SELECT payload FROM outbox_messages WHERE template = 'otp.pickup' AND recipient = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return unseal(m.payload.sealed!, process.env.OUTBOX_ENCRYPTION_KEY!).code;
}

describe("3.3 planning guards", () => {
  it("refuses a facility without code recipients, without waste, and an expired licence; plans a valid trip", async () => {
    as(admin);
    const notReady = await scenario({ ready: false });
    expect(
      await codeOf(
        createTrip({
          plannedDate: today,
          vehicleId: notReady.vehicleId,
          driverId: notReady.driverIds[0],
          stops: [{ facilityCode: notReady.facilityCode }],
        })
      )
    ).toBe("409 FACILITY_NOT_READY");

    const empty = await scenario({ waste: false });
    expect(
      await codeOf(
        createTrip({
          plannedDate: today,
          vehicleId: empty.vehicleId,
          driverId: empty.driverIds[0],
          stops: [{ facilityCode: empty.facilityCode }],
        })
      )
    ).toBe("409 NOTHING_TO_COLLECT");

    const s = await scenario();
    await q(
      `INSERT INTO licenses (subject_type, subject_id, kind, number, expires_on) VALUES ('VEHICLE', $1, 'Test permit', 'X', $2::date - 1)`,
      [s.vehicleId, today]
    );
    expect(
      await codeOf(
        createTrip({
          plannedDate: today,
          vehicleId: s.vehicleId,
          driverId: s.driverIds[0],
          stops: [{ facilityCode: s.facilityCode }],
        })
      )
    ).toBe("409 LICENCE_EXPIRED");
    await q(
      `INSERT INTO licenses (subject_type, subject_id, kind, number, expires_on) VALUES ('VEHICLE', $1, 'Test permit', 'Y', $2::date + 365)`,
      [s.vehicleId, today]
    );

    const trip = await createTrip({
      plannedDate: today,
      vehicleId: s.vehicleId,
      driverId: s.driverIds[0],
      stops: [{ facilityCode: s.facilityCode }],
    });
    expect(trip.tripCode).toMatch(/^TR-\d{6}-\d{2}$/);
    const [w] = await q<{ status: string }>(
      `SELECT w.status FROM waste_records w WHERE w.facility_id = $1`,
      [s.facilityId]
    );
    expect(w.status).toBe("SCHEDULED");
    const mail = await q(
      `SELECT template FROM outbox_messages WHERE template = 'trip.assigned' AND payload->'data'->>'tripCode' = $1`,
      [trip.tripCode]
    );
    expect(mail).toHaveLength(1);
    // Same vehicle, same day → refused before anything else.
    expect(
      await codeOf(
        createTrip({
          plannedDate: today,
          vehicleId: s.vehicleId,
          driverId: s.driverIds[1],
          stops: [{ facilityCode: s.facilityCode }],
        })
      )
    ).toBe("409 ALREADY_ASSIGNED");
    as(efda);
    expect(await codeOf(createTrip({}))).toBe("403 FORBIDDEN");
  });
});

describe("3.6–3.8 pickup with the SMS code", () => {
  it("arrive (once, idempotent) → scan every container → wrong code counted → right code completes atomically", async () => {
    const s = await scenario({ containers: 2 });
    const { tripId, stopId } = await planAndStart(s);

    as(s.drivers[1]); // not the assigned driver
    expect(await codeOf(arriveAtStop(stopId, meta()))).toBe("403 NOT_ASSIGNED");
    as(s.drivers[0]);
    const key = randomUUID();
    const first = await arriveAtStop(stopId, meta(key));
    const replay = await arriveAtStop(stopId, meta(key)); // double tap
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      status: "ARRIVED",
      geofenceOk: null,
      otpIssued: true,
      otpRecipients: 1,
      expected: 2,
      scanned: 0,
    });
    expect(await q(`SELECT id FROM otp_codes WHERE trip_stop_id = $1`, [stopId])).toHaveLength(1);
    expect(await codeOf(arriveAtStop(stopId, meta()))).toBe("409 INVALID_TRANSITION");

    const code = await currentCode(s.phone);
    // NO PARTIAL PICKUP: the code is not used up while scans are missing.
    expect(await codeOf(verifyOtp(stopId, { code }, meta()))).toBe("409 INCOMPLETE_SCAN");
    expect(
      await codeOf(scanContainer(stopId, { containerCode: "WR-0000-00000-C01" }, meta()))
    ).toBe("404 UNKNOWN_CONTAINER");
    expect(
      (await scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta())).scanned
    ).toBe(1);
    expect(
      await codeOf(scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta()))
    ).toBe("409 ALREADY_SCANNED");
    expect(
      (await scanContainer(stopId, { containerCode: s.containerCodes[1] }, meta())).scanned
    ).toBe(2);

    const wrong = code === "000000" ? "111111" : "000000";
    expect(await codeOf(verifyOtp(stopId, { code: wrong }, meta()))).toBe("422 OTP_INVALID");
    const [otpRow] = await q<{ attempts: number; status: string }>(
      `SELECT attempts, status FROM otp_codes WHERE trip_stop_id = $1`,
      [stopId]
    );
    expect(otpRow).toEqual({ attempts: 1, status: "ISSUED" }); // the failed attempt was committed

    const done = await verifyOtp(stopId, { code }, meta());
    expect(done).toMatchObject({ ok: true, status: "COLLECTED", method: "OTP", containers: 2 });
    const [stop] = await q<{ status: string; collection_method: string }>(
      `SELECT status, collection_method FROM trip_stops WHERE id = $1`,
      [stopId]
    );
    expect(stop).toEqual({ status: "COLLECTED", collection_method: "OTP" });
    const containers = await q<{ status: string }>(
      `SELECT c.status FROM containers c JOIN waste_records w ON w.id = c.waste_record_id WHERE w.facility_id = $1`,
      [s.facilityId]
    );
    expect(containers.map((c) => c.status)).toEqual(["COLLECTED", "COLLECTED"]);
    const [w] = await q<{ status: string }>(
      `SELECT status FROM waste_records WHERE facility_id = $1`,
      [s.facilityId]
    );
    expect(w.status).toBe("IN_TRANSIT");
    const [o] = await q<{ status: string }>(
      `SELECT status FROM otp_codes WHERE trip_stop_id = $1`,
      [stopId]
    );
    expect(o.status).toBe("VERIFIED");
    // The trip stays in progress: collected containers are on board until the site receives them (Gate 5).
    const [t] = await q<{ status: string }>(`SELECT status FROM trips WHERE id = $1`, [tripId]);
    expect(t.status).toBe("IN_PROGRESS");
    // Codes never reach the audit log.
    expect(
      JSON.stringify(
        await q(
          `SELECT after FROM audit_logs WHERE entity_id = $1::text OR entity_id IN (SELECT id::text FROM otp_codes WHERE trip_stop_id = $1::uuid)`,
          [stopId]
        )
      )
    ).not.toContain(code);
  });

  it("a code is locked after otp_max_attempts wrong tries", async () => {
    const s = await scenario({ containers: 1 });
    const { stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    await scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta());
    const code = await currentCode(s.phone);
    const wrong = code === "000000" ? "111111" : "000000";
    const [max] = await q<{ n: number }>(
      `SELECT (value #>> '{}')::int AS n FROM settings WHERE key = 'otp_max_attempts'`
    );
    for (let i = 1; i < max.n; i++)
      expect(await codeOf(verifyOtp(stopId, { code: wrong }, meta()))).toBe("422 OTP_INVALID");
    expect(await codeOf(verifyOtp(stopId, { code: wrong }, meta()))).toBe("423 OTP_LOCKED");
    expect(await codeOf(verifyOtp(stopId, { code }, meta()))).toBe("409 NO_ACTIVE_OTP"); // even the right code
  });
});

describe("3.8 / 3.10 one completion service", () => {
  it("OTP and in-app confirmation at the same time: exactly one completes the stop", async () => {
    const s = await scenario({ containers: 2 });
    const { stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    for (const c of s.containerCodes) await scanContainer(stopId, { containerCode: c }, meta());
    const code = await currentCode(s.phone);

    // The stub session is global, so each call captures its user before awaiting.
    const viaOtp = (async () => {
      as(s.drivers[0]);
      return verifyOtp(stopId, { code }, meta());
    })();
    const viaApp = (async () => {
      as(s.hospital);
      return confirmHandover(stopId, meta());
    })();
    const results = await Promise.allSettled([viaOtp, viaApp]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [stop] = await q<{ status: string }>(`SELECT status FROM trip_stops WHERE id = $1`, [
      stopId,
    ]);
    expect(stop.status).toBe("COLLECTED");
    const audits = await q(
      `SELECT 1 FROM audit_logs WHERE entity_id = $1 AND action = 'stop.collected'`,
      [stopId]
    );
    expect(audits).toHaveLength(1);
  });

  it("in-app: another facility's user gets 404; incomplete scans 409; the facility's own user completes", async () => {
    const s = await scenario({ containers: 2 });
    const { stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    await scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta());
    as(otherHospital);
    expect(await codeOf(confirmHandover(stopId, meta()))).toBe("404 NOT_FOUND");
    as(s.hospital);
    expect(await codeOf(confirmHandover(stopId, meta()))).toBe("409 INCOMPLETE_SCAN");
    as(s.drivers[0]);
    await scanContainer(stopId, { containerCode: s.containerCodes[1] }, meta());
    as(s.hospital);
    expect(await confirmHandover(stopId, meta())).toMatchObject({
      status: "COLLECTED",
      method: "IN_APP",
    });
    const [o] = await q<{ status: string }>(
      `SELECT status FROM otp_codes WHERE trip_stop_id = $1`,
      [stopId]
    );
    expect(o.status).toBe("CANCELLED");
  });

  it("3.11 override: super_admin with a reason, still every scan required", async () => {
    const s = await scenario({ containers: 1 });
    const { stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    as(admin);
    expect(await codeOf(overrideStop(stopId, { reason: "x" }, meta()))).toBe(
      "422 VALIDATION_ERROR"
    );
    expect(
      await codeOf(
        overrideStop(stopId, { reason: "Phones unreachable, head of facility confirmed" }, meta())
      )
    ).toBe("409 INCOMPLETE_SCAN");
    as(s.drivers[0]);
    await scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta());
    as(efda);
    expect(await codeOf(overrideStop(stopId, { reason: "Phones unreachable" }, meta()))).toBe(
      "403 FORBIDDEN"
    );
    as(admin);
    expect(
      await overrideStop(
        stopId,
        { reason: "Phones unreachable, head of facility confirmed" },
        meta()
      )
    ).toMatchObject({ status: "COLLECTED_OVERRIDE", method: "OVERRIDE" });
    const [stop] = await q<{ override_reason: string; collection_method: string }>(
      `SELECT override_reason, collection_method FROM trip_stops WHERE id = $1`,
      [stopId]
    );
    expect(stop).toEqual({
      override_reason: "Phones unreachable, head of facility confirmed",
      collection_method: "OVERRIDE",
    });
  });
});

describe("3.9 resend and skip", () => {
  it("resend respects the cooldown and the per-stop limit; the previous code is cancelled", async () => {
    const s = await scenario({ containers: 1 });
    const { stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    expect(await codeOf(resendOtp(stopId, meta()))).toBe("429 OTP_COOLDOWN");
    const [max] = await q<{ n: number }>(
      `SELECT (value #>> '{}')::int AS n FROM settings WHERE key = 'otp_max_per_stop'`
    );
    for (let i = 1; i < max.n; i++) {
      await q(
        `UPDATE otp_codes SET created_at = created_at - interval '1 hour' WHERE trip_stop_id = $1`,
        [stopId]
      );
      await resendOtp(stopId, meta());
    }
    const otps = await q<{ status: string }>(
      `SELECT status FROM otp_codes WHERE trip_stop_id = $1 ORDER BY created_at`,
      [stopId]
    );
    expect(otps.map((o) => o.status)).toEqual([...Array(max.n - 1).fill("CANCELLED"), "ISSUED"]);
    await q(
      `UPDATE otp_codes SET created_at = created_at - interval '1 hour' WHERE trip_stop_id = $1`,
      [stopId]
    );
    expect(await codeOf(resendOtp(stopId, meta()))).toBe("409 OTP_LIMIT_REACHED");
  });

  it("skip: scans cancelled, containers LABELLED, waste back on the waiting list, trip completes when nothing is on board", async () => {
    const s = await scenario({ containers: 2 });
    const { tripId, stopId } = await planAndStart(s);
    await arriveAtStop(stopId, meta());
    await scanContainer(stopId, { containerCode: s.containerCodes[0] }, meta());
    expect(await codeOf(skipStop(stopId, { reason: "" }, meta()))).toBe("422 VALIDATION_ERROR");
    expect(await skipStop(stopId, { reason: "Store room locked" }, meta())).toMatchObject({
      status: "SKIPPED",
      tripCompleted: true,
    });
    const [h] = await q<{ status: string }>(
      `SELECT status FROM handovers WHERE trip_stop_id = $1`,
      [stopId]
    );
    expect(h.status).toBe("CANCELLED");
    const cs = await q<{ status: string }>(
      `SELECT c.status FROM containers c JOIN waste_records w ON w.id = c.waste_record_id WHERE w.facility_id = $1`,
      [s.facilityId]
    );
    expect(cs.map((c) => c.status)).toEqual(["LABELLED", "LABELLED"]);
    const [w] = await q<{ status: string; linked: boolean }>(
      `SELECT w.status, EXISTS (SELECT 1 FROM trip_stop_waste l WHERE l.waste_record_id = w.id AND l.active) AS linked FROM waste_records w WHERE w.facility_id = $1`,
      [s.facilityId]
    );
    expect(w).toEqual({ status: "REGISTERED", linked: false });
    const [t] = await q<{ status: string; v: string; d: string }>(
      `SELECT t.status, v.status AS v, d.status AS d FROM trips t JOIN vehicles v ON v.id = t.vehicle_id JOIN drivers d ON d.id = t.driver_id WHERE t.id = $1`,
      [tripId]
    );
    expect(t).toEqual({ status: "COMPLETED", v: "ACTIVE", d: "ON_DUTY" });
  });
});

describe("3.4 reassignment and cancellation", () => {
  it("reassigning a planned trip moves it to the new driver; the former driver loses access at once", async () => {
    const s = await scenario({ containers: 1 });
    as(admin);
    const trip = await createTrip({
      plannedDate: today,
      vehicleId: s.vehicleId,
      driverId: s.driverIds[0],
      stops: [{ facilityCode: s.facilityCode }],
    });
    const r = await reassignTrip(trip.id, { driverId: s.driverIds[1] }, meta());
    expect(r.tripCode).toBe(trip.tripCode);
    as(s.drivers[0]);
    expect(await codeOf(startTrip(trip.id, meta()))).toBe("403 NOT_ASSIGNED");
    as(s.drivers[1]);
    expect(await startTrip(trip.id, meta())).toMatchObject({ status: "IN_PROGRESS" });
    as(admin);
    expect(await codeOf(reassignTrip(trip.id, { driverId: s.driverIds[0] }, meta()))).toBe(
      "409 INVALID_TRANSITION"
    );
  });

  it("cancelling a planned trip releases its waste; a started trip with an arrival cannot be cancelled", async () => {
    const s = await scenario({ containers: 1 });
    as(admin);
    const trip = await createTrip({
      plannedDate: today,
      vehicleId: s.vehicleId,
      driverId: s.driverIds[0],
      stops: [{ facilityCode: s.facilityCode }],
    });
    expect(await cancelTrip(trip.id, { reason: "Vehicle breakdown" }, meta())).toMatchObject({
      status: "CANCELLED",
    });
    const [w] = await q<{ status: string }>(
      `SELECT status FROM waste_records WHERE facility_id = $1`,
      [s.facilityId]
    );
    expect(w.status).toBe("REGISTERED");
    const [stop] = await q<{ status: string }>(`SELECT status FROM trip_stops WHERE trip_id = $1`, [
      trip.id,
    ]);
    expect(stop.status).toBe("SKIPPED");

    const s2 = await scenario({ containers: 1 });
    const started = await planAndStart(s2);
    await arriveAtStop(started.stopId, meta());
    as(admin);
    expect(await codeOf(cancelTrip(started.tripId, { reason: "Changed plan" }, meta()))).toBe(
      "409 TRIP_HAS_PICKUPS"
    );
  });
});

describe("EFDA is read-only (CLAUDE.md §3)", () => {
  it("every pickup command refuses the EFDA officer with 403", async () => {
    as(efda);
    const id = randomUUID();
    for (const call of [
      () => startTrip(id, meta()),
      () => arriveAtStop(id, meta()),
      () => scanContainer(id, { containerCode: "WR-2610-00001-C01" }, meta()),
      () => verifyOtp(id, { code: "123456" }, meta()),
      () => resendOtp(id, meta()),
      () => skipStop(id, { reason: "x x x" }, meta()),
      () => confirmHandover(id, meta()),
      () => overrideStop(id, { reason: "x x x" }, meta()),
      () => cancelTrip(id, { reason: "x x x" }, meta()),
      () => reassignTrip(id, { driverId: id }, meta()),
    ]) {
      expect(await codeOf(call())).toBe("403 FORBIDDEN");
    }
  });
});
