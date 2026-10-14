import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import {
  closeWithoutDestruction,
  destroyWaste,
  receiveContainer,
  recordContainerException,
} from "@/server/services/disposal"; // vi.mock calls below are hoisted
import {
  checkCertificateFile,
  downloadCertificate,
  generateCertificate,
  revokeCertificate,
} from "@/server/services/certificates";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 5.1–5.5: receipt, exceptions, destruction, certificates — through the services on the Neon `test` branch
 * (these commit). Each test builds its own truck load. Files go to a temporary folder; the storage can be told to
 * fail, to prove that a certificate failure never undoes the destruction.
 */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));

const storage = vi.hoisted(() => ({ fail: false, dir: "" }));
vi.mock("@/server/integrations/storage", async (original) => {
  const real = await original<typeof import("@/server/integrations/storage")>();
  return {
    ...real,
    getStorage: () => {
      const local = real.localStorageProvider(storage.dir);
      return {
        name: "test",
        get: local.get,
        put: async (key: string, bytes: Uint8Array, type: string) => {
          if (storage.fail) throw new Error("Storage is down (test)");
          return local.put(key, bytes, type);
        },
      };
    },
  };
});

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const meta = (key = randomUUID()) => ({ requestId: "test", idempotencyKey: key });
const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

let operator: ActiveUser;
let admin: ActiveUser;
let efda: ActiveUser;
let otherHospital: ActiveUser;
beforeAll(async () => {
  storage.dir = mkdtempSync(join(tmpdir(), "sw-certs-"));
  const users = await q<{
    clerk_user_id: string;
    id: string;
    role: Role;
    facility_id: string | null;
  }>(
    `SELECT clerk_user_id, id, role, facility_id FROM users
     WHERE clerk_user_id IN ('dev_disposal_operator', 'dev_super_admin', 'dev_efda_officer', 'dev_hospital_admin')`
  );
  const by = (k: string) => {
    const u = users.find((x) => x.clerk_user_id === k)!;
    return { id: u.id, role: u.role, facilityId: u.facility_id, active: true };
  };
  operator = by("dev_disposal_operator");
  admin = by("dev_super_admin");
  efda = by("dev_efda_officer");
  otherHospital = by("dev_hospital_admin");
});
afterAll(closeTestPool);

/** A truck in progress carrying one waste record with `n` COLLECTED containers from a fresh facility. */
async function truckLoad(n = 3) {
  const code = `DS-${letters()}-${digits(3)}`;
  const [f] = await q<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'Test road', 9.6, 41.85) RETURNING id`,
    [code, `Disposal Test Clinic ${code}`]
  );
  const t = `${Date.now()}${digits(3)}`;
  const [hu] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_admin', $2, 'Disposal Test Admin', $3) RETURNING id`,
    [`test_dsh_${t}`, f.id, `dsh${t}@example.test`]
  );
  const [du] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'Disposal Test Driver', $2) RETURNING id`,
    [`test_dsd_${t}`, `dsd${t}@example.test`]
  );
  const [d] = await q<{ id: string }>(
    `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, 'ON_TRIP') RETURNING id`,
    [du.id, `DS-${t}`]
  );
  const [v] = await q<{ id: string }>(
    `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, 'IN_TRANSIT') RETURNING id`,
    [`DS-${digits(7)}`]
  );
  const [trip] = await q<{ id: string }>(
    `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
     VALUES ($1, $2, $3, current_date, 'IN_PROGRESS', now() - interval '2 hours') RETURNING id`,
    [`TR-99${digits(4)}-${digits(2)}`, v.id, d.id]
  );
  const [stop] = await q<{ id: string }>(
    `INSERT INTO trip_stops (trip_id, facility_id, priority_order, status, arrived_at, completed_at, collection_method, confirmed_by)
     VALUES ($1, $2, 1, 'COLLECTED', now() - interval '90 minutes', now() - interval '80 minutes', 'IN_APP', $3) RETURNING id`,
    [trip.id, f.id, hu.id]
  );
  const [cat] = await q<{ id: string }>(`SELECT id FROM waste_categories WHERE code = 'SHARPS'`);
  const wasteCode = `WR-99${digits(2)}-${digits(5)}`;
  const [w] = await q<{ id: string }>(
    `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status)
     VALUES ($1, $2, $3, $4, 12.5, $5, 'IN_TRANSIT') RETURNING id`,
    [wasteCode, f.id, cat.id, n, hu.id]
  );
  await q(`INSERT INTO trip_stop_waste (trip_stop_id, waste_record_id) VALUES ($1, $2)`, [
    stop.id,
    w.id,
  ]);
  const codes: string[] = [];
  for (let i = 1; i <= n; i++) {
    const c = `${wasteCode}-C${String(i).padStart(2, "0")}`;
    const [ct] = await q<{ id: string }>(
      `INSERT INTO containers (container_code, waste_record_id, seq_no, status) VALUES ($1, $2, $3, 'COLLECTED') RETURNING id`,
      [c, w.id, i]
    );
    // The pickup scan evidence (NO PARTIAL PICKUP: a completed stop has a scan for every container).
    await q(`INSERT INTO handovers (trip_stop_id, container_id, driver_id) VALUES ($1, $2, $3)`, [
      stop.id,
      ct.id,
      d.id,
    ]);
    codes.push(c);
  }
  const hospital: ActiveUser = {
    id: hu.id,
    role: "hospital_admin",
    facilityId: f.id,
    active: true,
  };
  return {
    wasteId: w.id,
    wasteCode,
    codes,
    tripId: trip.id,
    vehicleId: v.id,
    driverId: d.id,
    hospital,
  };
}

const wasteStatus = async (id: string) =>
  (await q<{ status: string }>(`SELECT status FROM waste_records WHERE id = $1`, [id]))[0].status;

describe("5.1 receipt", () => {
  it("only the site operator: EFDA, hospital and admin get 403", async () => {
    const load = await truckLoad(1);
    for (const u of [efda, otherHospital, admin]) {
      session = u;
      expect(await refusal(receiveContainer({ containerCode: load.codes[0] }, meta()))).toBe(
        "403 FORBIDDEN"
      );
      expect(
        await refusal(
          recordContainerException(
            { containerCode: load.codes[0], kind: "MISSING", reason: "Not here" },
            meta()
          )
        )
      ).toBe("403 FORBIDDEN");
      expect(
        await refusal(destroyWaste(load.wasteId, { methodCode: "HIGH_TEMP_INCINERATION" }, meta()))
      ).toBe("403 FORBIDDEN");
      expect(
        await refusal(closeWithoutDestruction(load.wasteId, { reason: "Nothing" }, meta()))
      ).toBe("403 FORBIDDEN");
    }
    session = { ...operator, facilityId: null };
    expect(await refusal(receiveContainer({ containerCode: load.codes[0] }, meta()))).toBe(
      "403 FORBIDDEN"
    );
  });

  it("every container checked in → waste RECEIVED, trip COMPLETED, vehicle and driver free; replays are one action", async () => {
    session = operator;
    const load = await truckLoad(2);
    const key = randomUUID();
    const first = await receiveContainer({ containerCode: load.codes[0] }, meta(key));
    expect(first).toMatchObject({
      status: "RECEIVED",
      wasteStatus: "IN_TRANSIT",
      remaining: 1,
      tripCompleted: false,
    });
    expect(await receiveContainer({ containerCode: load.codes[0] }, meta(key))).toEqual(first); // same tap again
    expect(await refusal(receiveContainer({ containerCode: load.codes[0] }, meta()))).toBe(
      "409 ALREADY_RECEIVED"
    );

    const last = await receiveContainer({ containerCode: load.codes[1].toLowerCase() }, meta());
    expect(last).toMatchObject({ wasteStatus: "RECEIVED", remaining: 0, tripCompleted: true });
    const [trip] = await q<{ status: string }>(`SELECT status FROM trips WHERE id = $1`, [
      load.tripId,
    ]);
    expect(trip.status).toBe("COMPLETED");
    const [veh] = await q<{ status: string }>(`SELECT status FROM vehicles WHERE id = $1`, [
      load.vehicleId,
    ]);
    expect(veh.status).toBe("ACTIVE");
    const [rec] = await q<{ operator_id: string; received_at: Date; locked: boolean }>(
      `SELECT operator_id, received_at, locked FROM disposal_records WHERE waste_record_id = $1`,
      [load.wasteId]
    );
    expect(rec).toMatchObject({ operator_id: operator.id, locked: false });
    expect(rec.received_at).not.toBeNull();
  });

  it("unknown, not collected, missing reason", async () => {
    session = operator;
    const load = await truckLoad(1);
    expect(await refusal(receiveContainer({ containerCode: "WR-9999-99999-C01" }, meta()))).toBe(
      "404 UNKNOWN_CONTAINER"
    );
    // A container still at the hospital (waste REGISTERED, container LABELLED) cannot be checked in.
    const [w] = await q<{ facility_id: string; category_id: string; registered_by: string }>(
      `SELECT facility_id, category_id, registered_by FROM waste_records WHERE id = $1`,
      [load.wasteId]
    );
    const waiting = `WR-99${digits(2)}-${digits(5)}`;
    const [ww] = await q<{ id: string }>(
      `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by)
       VALUES ($1, $2, $3, 1, 2, $4) RETURNING id`,
      [waiting, w.facility_id, w.category_id, w.registered_by]
    );
    await q(`INSERT INTO containers (container_code, waste_record_id, seq_no) VALUES ($1, $2, 1)`, [
      `${waiting}-C01`,
      ww.id,
    ]);
    expect(await refusal(receiveContainer({ containerCode: `${waiting}-C01` }, meta()))).toBe(
      "409 NOT_COLLECTED"
    );
    expect(
      await refusal(
        recordContainerException(
          { containerCode: load.codes[0], kind: "MISSING", reason: "" },
          meta()
        )
      )
    ).toBe("422 VALIDATION_ERROR");
  });
});

describe("5.2 destruction and 5.3 certificate", () => {
  it("destruction locks the record, containers DESTROYED, waste DISPOSED_WITH_EXCEPTION, certificate issued with its hash", async () => {
    session = operator;
    const load = await truckLoad(3);
    await receiveContainer({ containerCode: load.codes[0] }, meta());
    await receiveContainer({ containerCode: load.codes[1] }, meta());
    expect(
      await recordContainerException(
        { containerCode: load.codes[2], kind: "REFUSED", reason: "Leaking lid" },
        meta()
      )
    ).toMatchObject({ status: "REFUSED", wasteStatus: "RECEIVED" });

    expect(
      await refusal(destroyWaste(load.wasteId, { methodCode: "NO_SUCH_METHOD" }, meta()))
    ).toBe("422 VALIDATION_ERROR");
    const [method] = await q<{ code: string }>(
      `SELECT code FROM destruction_methods WHERE active LIMIT 1`
    );
    const done = await destroyWaste(load.wasteId, { methodCode: method.code }, meta());
    expect(done).toMatchObject({ status: "DISPOSED_WITH_EXCEPTION", destroyed: 2, exceptions: 1 });
    expect(done.certificate.certificateNo).toMatch(/^CD-\d{4}-\d{5}$/);
    expect(await wasteStatus(load.wasteId)).toBe("DISPOSED_WITH_EXCEPTION");
    const statuses = await q<{ status: string }>(
      `SELECT status FROM containers WHERE waste_record_id = $1 ORDER BY seq_no`,
      [load.wasteId]
    );
    expect(statuses.map((s) => s.status)).toEqual(["DESTROYED", "DESTROYED", "REFUSED"]);

    // Locked for good: no second destruction, and the database refuses any change to the record.
    expect(await refusal(destroyWaste(load.wasteId, { methodCode: method.code }, meta()))).toBe(
      "409 INVALID_TRANSITION"
    );
    await expect(
      q(`UPDATE disposal_records SET received_at = now() WHERE waste_record_id = $1`, [
        load.wasteId,
      ])
    ).rejects.toThrow(/locked/);

    const [pending] = await q<{ status: string }>(`SELECT status FROM certificates WHERE id = $1`, [
      done.certificate.id,
    ]);
    expect(pending.status).toBe("PENDING");
    expect(await generateCertificate(done.certificate.id)).toBe("ISSUED");
    expect(await generateCertificate(done.certificate.id)).toBe("SKIPPED"); // already issued
    const [cert] = await q<{
      status: string;
      sha256: string;
      verify_token: string;
      file_key: string;
    }>(`SELECT status, sha256, verify_token, file_key FROM certificates WHERE id = $1`, [
      done.certificate.id,
    ]);
    expect(cert.status).toBe("ISSUED");

    // 5.4 the stored file matches its hash; any change does not.
    session = load.hospital;
    const file = await downloadCertificate(done.certificate.id, "test");
    expect(createHash("sha256").update(file.bytes).digest("hex")).toBe(cert.sha256);
    expect(Buffer.from(file.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(await checkCertificateFile(cert.verify_token, file.bytes)).toMatchObject({
      match: true,
      status: "ISSUED",
    });
    const changed = new Uint8Array(file.bytes);
    changed[changed.length - 10] ^= 1;
    expect(await checkCertificateFile(cert.verify_token, changed)).toMatchObject({ match: false });

    // 5.5 another facility's hospital user cannot download it; downloads are audited.
    session = otherHospital;
    expect(await refusal(downloadCertificate(done.certificate.id, "test"))).toBe("404 NOT_FOUND");
    const audits = await q(
      `SELECT id FROM audit_logs WHERE entity_type = 'certificate' AND entity_id = $1::text AND action = 'certificate.downloaded'`,
      [done.certificate.id]
    );
    expect(audits).toHaveLength(1);
  });

  it("a certificate failure never undoes the destruction; the job retries FAILED → ISSUED", async () => {
    session = operator;
    const load = await truckLoad(1);
    await receiveContainer({ containerCode: load.codes[0] }, meta());
    const [method] = await q<{ code: string }>(
      `SELECT code FROM destruction_methods WHERE active LIMIT 1`
    );
    const done = await destroyWaste(load.wasteId, { methodCode: method.code }, meta());

    storage.fail = true;
    try {
      expect(await generateCertificate(done.certificate.id)).toBe("FAILED");
    } finally {
      storage.fail = false;
    }
    const [failed] = await q<{ status: string; generation_attempts: number; last_error: string }>(
      `SELECT status, generation_attempts, last_error FROM certificates WHERE id = $1`,
      [done.certificate.id]
    );
    expect(failed).toMatchObject({ status: "FAILED", generation_attempts: 1 });
    expect(failed.last_error).toMatch(/Storage is down/);
    expect(await wasteStatus(load.wasteId)).toBe("DISPOSED");
    const [rec] = await q<{ locked: boolean }>(
      `SELECT locked FROM disposal_records WHERE waste_record_id = $1`,
      [load.wasteId]
    );
    expect(rec.locked).toBe(true);

    // The retry is the job's work for this certificate (the queue job itself is not run here: it would also
    // issue the seeded PENDING / FAILED demo certificates).
    expect(await generateCertificate(done.certificate.id)).toBe("ISSUED");
    const [issued] = await q<{ status: string; generation_attempts: number }>(
      `SELECT status, generation_attempts FROM certificates WHERE id = $1`,
      [done.certificate.id]
    );
    expect(issued).toMatchObject({ status: "ISSUED", generation_attempts: 2 });
  });

  it("nothing received: destruction refused, close without destruction needs a reason, no certificate", async () => {
    session = operator;
    const load = await truckLoad(2);
    for (const c of load.codes) {
      await recordContainerException(
        { containerCode: c, kind: "MISSING", reason: "Not on the truck" },
        meta()
      );
    }
    expect(await wasteStatus(load.wasteId)).toBe("RECEIVED");
    const [method] = await q<{ code: string }>(
      `SELECT code FROM destruction_methods WHERE active LIMIT 1`
    );
    expect(await refusal(destroyWaste(load.wasteId, { methodCode: method.code }, meta()))).toBe(
      "409 NOTHING_TO_DESTROY"
    );
    expect(await refusal(closeWithoutDestruction(load.wasteId, { reason: "" }, meta()))).toBe(
      "422 VALIDATION_ERROR"
    );
    expect(
      await closeWithoutDestruction(
        load.wasteId,
        { reason: "Both containers lost in transit" },
        meta()
      )
    ).toMatchObject({ status: "CLOSED_NO_DESTRUCTION" });
    expect(await wasteStatus(load.wasteId)).toBe("CLOSED_NO_DESTRUCTION");
    expect(
      await q(
        `SELECT c.id FROM certificates c JOIN disposal_records d ON d.id = c.disposal_record_id WHERE d.waste_record_id = $1`,
        [load.wasteId]
      )
    ).toHaveLength(0);
  });
});

describe("5.5 revoke and reissue", () => {
  it("super_admin revokes with a reason and reissues a new certificate; the waste status does not change", async () => {
    session = operator;
    const load = await truckLoad(1);
    await receiveContainer({ containerCode: load.codes[0] }, meta());
    const [method] = await q<{ code: string }>(
      `SELECT code FROM destruction_methods WHERE active LIMIT 1`
    );
    const done = await destroyWaste(load.wasteId, { methodCode: method.code }, meta());
    await generateCertificate(done.certificate.id);

    for (const u of [efda, operator, load.hospital]) {
      session = u;
      expect(
        await refusal(revokeCertificate(done.certificate.id, { reason: "Wrong data" }, meta()))
      ).toBe("403 FORBIDDEN");
    }
    session = admin;
    expect(await refusal(revokeCertificate(done.certificate.id, { reason: "" }, meta()))).toBe(
      "422 VALIDATION_ERROR"
    );
    const r = await revokeCertificate(
      done.certificate.id,
      { reason: "Facility name was wrong", reissue: true },
      meta()
    );
    expect(r).toMatchObject({ status: "REVOKED" });
    expect(r.reissued?.certificateNo).toMatch(/^CD-\d{4}-\d{5}$/);
    const certs = await q<{ id: string; status: string; revoked_reason: string | null }>(
      `SELECT c.id, c.status, c.revoked_reason FROM certificates c JOIN disposal_records d ON d.id = c.disposal_record_id
       WHERE d.waste_record_id = $1 ORDER BY c.created_at`,
      [load.wasteId]
    );
    expect(certs.map((c) => c.status)).toEqual(["REVOKED", "PENDING"]);
    expect(certs[0].revoked_reason).toBe("Facility name was wrong");
    expect(await wasteStatus(load.wasteId)).toBe("DISPOSED");
    expect(await refusal(revokeCertificate(done.certificate.id, { reason: "Again" }, meta()))).toBe(
      "409 INVALID_TRANSITION"
    );
    expect(await generateCertificate(r.reissued!.id)).toBe("ISSUED");
  });
});
