import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import {
  createFacility,
  setFacilityStatus,
  updateFacility,
  updateHospitalUser,
  updateUserAccess,
} from "@/server/services/facilities"; // vi.mock below is hoisted
import { closeTestPool, testPool } from "./db";

/**
 * Gate 3.1: facility master data and user access. These services commit (on the Neon `test` branch); every
 * test restores what it changed. The session user is a stub chosen per test.
 */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));

const users: Record<string, ActiveUser & { phone_verified?: boolean }> = {};
const createdCodes: string[] = [];
beforeAll(async () => {
  const { rows } = await testPool().query(
    `SELECT clerk_user_id, id, role, facility_id FROM users WHERE clerk_user_id LIKE 'dev_%' OR clerk_user_id LIKE 'seed_%'`
  );
  for (const r of rows)
    users[r.clerk_user_id] = { id: r.id, role: r.role, facilityId: r.facility_id, active: true };
});
afterAll(async () => {
  if (createdCodes.length) {
    await testPool().query(`DELETE FROM facilities WHERE code = ANY($1)`, [createdCodes]);
  }
  await closeTestPool();
});

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

const newCode = () => {
  const code = `TT-TST-${String(Math.floor(Math.random() * 900) + 100)}`;
  createdCodes.push(code);
  return code;
};
const facility = (code: string) => ({
  code,
  name: "Test Clinic",
  type: "CLINIC",
  region: "Dire Dawa",
  address: "Test road 1",
  lat: 9.6,
  lng: 41.85,
});

describe("facilities (super_admin)", () => {
  it("creates a facility (audited); duplicate code 409; bad input 422; other roles 403", async () => {
    session = users.dev_super_admin;
    const code = newCode();
    const created = await createFacility(facility(code));
    expect(created.code).toBe(code);
    const audit = await testPool().query(
      `SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY seq`,
      [created.id]
    );
    expect(audit.rows.map((r) => r.action)).toEqual(["facility.created"]);

    expect(await codeOf(createFacility(facility(code)))).toBe("409 CONFLICT");
    const bad = (await createFacility({ ...facility(newCode()), code: "bad", lat: 200 }).catch(
      (e: unknown) => e
    )) as AppError;
    expect(Object.keys(bad.details.fields as object).sort()).toEqual(["code", "lat"]);

    for (const key of ["dev_hospital_admin", "dev_efda_officer", "dev_driver"]) {
      session = users[key];
      expect(await codeOf(createFacility(facility(newCode()))), key).toBe("403 FORBIDDEN");
    }
  });

  it("codes never change; a health facility cannot become the disposal site; status via the engine", async () => {
    session = users.dev_super_admin;
    const code = newCode();
    await createFacility(facility(code));
    expect(await codeOf(updateFacility(code, { ...facility(code), code: "TT-TST-999" }))).toBe(
      "422 VALIDATION_ERROR"
    );
    expect(await codeOf(updateFacility(code, { ...facility(code), type: "DISPOSAL_SITE" }))).toBe(
      "422 VALIDATION_ERROR"
    );
    await updateFacility(code, { ...facility(code), name: "Renamed Test Clinic" });
    const r = await setFacilityStatus(code, { status: "SUSPENDED" });
    expect(r).toMatchObject({ from: "ACTIVE", to: "SUSPENDED" });
    expect(await codeOf(setFacilityStatus(code, { status: "SUSPENDED" }))).toBe(
      "409 INVALID_TRANSITION"
    );
    const actions = await testPool().query(
      `SELECT a.action FROM audit_logs a JOIN facilities f ON f.id::text = a.entity_id WHERE f.code = $1 ORDER BY a.seq`,
      [code]
    );
    expect(actions.rows.map((x) => x.action)).toEqual([
      "facility.created",
      "facility.updated",
      "facility.status_changed",
    ]);
  });
});

describe("user access (super_admin)", () => {
  it("cannot remove its own admin access; driver profile keeps the driver role; OTP needs a verified phone", async () => {
    session = users.dev_super_admin;
    expect(
      await codeOf(
        updateUserAccess(session.id, {
          role: "efda_officer",
          facilityCode: null,
          active: true,
          receivesPickupOtp: false,
        })
      )
    ).toBe("403 FORBIDDEN");
    expect(
      await codeOf(
        updateUserAccess(users.dev_driver.id, {
          role: "efda_officer",
          facilityCode: null,
          active: true,
          receivesPickupOtp: false,
        })
      )
    ).toBe("422 VALIDATION_ERROR");
    // seed_dd_cli_017_staff has a phone that is NOT verified.
    expect(
      await codeOf(
        updateUserAccess(users.seed_dd_cli_017_staff.id, {
          role: "hospital_staff",
          facilityCode: "DD-CLI-017",
          active: true,
          receivesPickupOtp: true,
        })
      )
    ).toBe("422 VALIDATION_ERROR");
  });

  it("changes a role and audits it as user.role_changed (then restores it)", async () => {
    session = users.dev_super_admin;
    const target = users.seed_dd_ref_001_staff;
    await updateUserAccess(target.id, {
      role: "hospital_admin",
      facilityCode: "DD-REF-001",
      active: true,
      receivesPickupOtp: false,
    });
    const { rows } = await testPool().query(
      `SELECT action, after FROM audit_logs WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
      [target.id]
    );
    expect(rows[0]).toMatchObject({
      action: "user.role_changed",
      after: { role: "hospital_admin" },
    });
    await updateUserAccess(target.id, {
      role: "hospital_staff",
      facilityCode: "DD-REF-001",
      active: true,
      receivesPickupOtp: false,
    });
  });
});

describe("hospital_admin: own facility users only", () => {
  it("another facility's user is not found; own user can be toggled; cannot deactivate itself", async () => {
    session = users.dev_hospital_admin; // DD-REF-001
    expect(
      await codeOf(
        updateHospitalUser(users.dev_hospital_staff.id, { active: true, receivesPickupOtp: true })
      )
    ).toBe("404 NOT_FOUND"); // DD-GEN-002
    expect(
      await codeOf(updateHospitalUser(session.id, { active: false, receivesPickupOtp: true }))
    ).toBe("403 FORBIDDEN");

    const own = users.seed_dd_ref_001_staff; // verified phone, not a recipient
    await updateHospitalUser(own.id, { active: true, receivesPickupOtp: true });
    const { rows } = await testPool().query(`SELECT receives_pickup_otp FROM users WHERE id = $1`, [
      own.id,
    ]);
    expect(rows[0].receives_pickup_otp).toBe(true);
    await updateHospitalUser(own.id, { active: true, receivesPickupOtp: false });

    session = users.dev_hospital_staff;
    expect(
      await codeOf(updateHospitalUser(own.id, { active: true, receivesPickupOtp: true }))
    ).toBe("403 FORBIDDEN");
  });
});
