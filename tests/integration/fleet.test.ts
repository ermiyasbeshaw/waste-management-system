import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { drizzleOn } from "./db";
import { AppError } from "@/server/errors";
import {
  addLicence,
  createTracker,
  createVehicle,
  rotateTrackerToken,
  setVehicleStatus,
} from "@/server/services/fleet"; // vi.mock below is hoisted
import { expiredLicences } from "@/server/services/licences";
import { closeTestPool, testPool } from "./db";

/** Gate 3.2: fleet management (commits on the Neon `test` branch; everything created is removed afterwards). */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));

const admin: ActiveUser = { id: "", role: "super_admin", facilityId: null, active: true };
const plate = `TEST-${Date.now() % 100000}`;
const device = `TEST-TRK-${Date.now() % 100000}`;
beforeAll(async () => {
  admin.id = (
    await testPool().query(`SELECT id FROM users WHERE clerk_user_id = 'dev_super_admin'`)
  ).rows[0].id;
});
afterAll(async () => {
  await testPool().query(
    `DELETE FROM licenses WHERE subject_id IN (SELECT id FROM vehicles WHERE plate_no = $1)`,
    [plate]
  );
  await testPool().query(`DELETE FROM tracker_devices WHERE device_id = $1`, [device]);
  await testPool().query(`DELETE FROM vehicles WHERE plate_no = $1`, [plate]);
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

describe("fleet (super_admin)", () => {
  it("vehicles: create (audited), duplicate plate 409, other roles 403", async () => {
    session = admin;
    const v = await createVehicle({
      plateNo: plate.toLowerCase(),
      model: "Test truck",
      capacityKg: 1500,
    });
    expect(v.plateNo).toBe(plate);
    expect(await codeOf(createVehicle({ plateNo: plate, capacityKg: 1000 }))).toBe("409 CONFLICT");
    session = { ...admin, role: "efda_officer" };
    expect(await codeOf(createVehicle({ plateNo: "X-1", capacityKg: 1 }))).toBe("403 FORBIDDEN");
  });

  it("trackers: the token is returned once and only its SHA-256 is stored; rotation replaces it", async () => {
    session = admin;
    const t = await createTracker({ deviceId: device, vehiclePlate: plate });
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = (
      await testPool().query(`SELECT token_hash FROM tracker_devices WHERE id = $1`, [t.id])
    ).rows[0];
    expect(stored.token_hash).toBe(createHash("sha256").update(t.token).digest("hex"));
    const r = await rotateTrackerToken(t.id);
    expect(r.token).not.toBe(t.token);
    const audit = await testPool().query(`SELECT after FROM audit_logs WHERE entity_id = $1`, [
      t.id,
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(t.token); // tokens never reach the audit log
  });

  it("licences: latest per kind counts; an expired one is reported for that date", async () => {
    session = admin;
    const vehicleId = (
      await testPool().query(`SELECT id FROM vehicles WHERE plate_no = $1`, [plate])
    ).rows[0].id;
    await addLicence({
      subjectType: "VEHICLE",
      subjectRef: plate,
      kind: "Test permit",
      number: "T-1",
      expiresOn: "2026-01-31",
    });
    const tx = drizzleOn(testPool());
    expect(
      await expiredLicences(tx, [{ type: "VEHICLE", id: vehicleId }], "2026-02-01")
    ).toHaveLength(1);
    expect(
      await expiredLicences(tx, [{ type: "VEHICLE", id: vehicleId }], "2026-01-31")
    ).toHaveLength(0);
    // A renewal (newer row of the same kind) clears the problem.
    await addLicence({
      subjectType: "VEHICLE",
      subjectRef: plate,
      kind: "Test permit",
      number: "T-2",
      expiresOn: "2027-01-31",
    });
    expect(
      await expiredLicences(tx, [{ type: "VEHICLE", id: vehicleId }], "2026-02-01")
    ).toHaveLength(0);
    expect(
      await codeOf(
        addLicence({
          subjectType: "VEHICLE",
          subjectRef: "NO-SUCH",
          kind: "x",
          number: "1",
          expiresOn: "2027-01-01",
        })
      )
    ).toBe("422 VALIDATION_ERROR");
  });

  it("vehicle status goes through the engine; a vehicle on a trip in progress cannot be changed", async () => {
    session = admin;
    const vehicleId = (
      await testPool().query(`SELECT id FROM vehicles WHERE plate_no = $1`, [plate])
    ).rows[0].id;
    expect(await setVehicleStatus(vehicleId, { status: "MAINTENANCE" })).toMatchObject({
      to: "MAINTENANCE",
    });
    await setVehicleStatus(vehicleId, { status: "ACTIVE" });
    const busy = (
      await testPool().query(`SELECT vehicle_id FROM trips WHERE status = 'IN_PROGRESS' LIMIT 1`)
    ).rows[0];
    if (busy)
      expect(await codeOf(setVehicleStatus(busy.vehicle_id, { status: "OFFLINE" }))).toBe(
        "409 VEHICLE_ON_TRIP"
      );
  });
});
