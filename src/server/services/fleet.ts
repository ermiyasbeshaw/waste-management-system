import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  driverProfileSchema,
  licenceSchema,
  trackerSchema,
  vehicleSchema,
  vehicleStatusSchema,
} from "@/lib/validation/fleet";
import { writeAudit } from "@/server/audit/writer";
import { requireRole } from "@/server/auth/current-user";
import type { DbExecutor } from "@/server/db/executor";
import { drivers, facilities, licenses, trackerDevices, users, vehicles } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { inWorkflow, transition } from "@/server/workflow/engine";
import { friendlyDbError, invalid } from "./_errors";

/**
 * Fleet management (CLAUDE.md §3: super_admin manages vehicles, drivers, trackers; §6: tracker tokens are
 * stored hashed; licences block assignment when expired). Every change is audited; vehicle status changes go
 * through the Workflow Engine.
 */

async function vehicleIdByPlate(tx: DbExecutor, plate: string | null): Promise<string | null> {
  if (!plate) return null;
  const [v] = await tx
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.plateNo, plate.toUpperCase()))
    .limit(1);
  if (!v)
    throw new AppError("VALIDATION_ERROR", 422, "Unknown vehicle.", {
      fields: { vehiclePlate: ["Unknown vehicle"] },
    });
  return v.id;
}

export async function createVehicle(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const { plateNo, model, capacityKg } = parsed.data;
  return inWorkflow(async (tx) => {
    const [row] = await tx
      .insert(vehicles)
      .values({ plateNo, model, capacityKg: String(capacityKg) })
      .returning({ id: vehicles.id, plateNo: vehicles.plateNo })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: row.id,
      after: parsed.data,
      requestId,
    });
    return row;
  });
}

export async function updateVehicle(vehicleId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", 404, "Vehicle not found.");
    const values = {
      plateNo: parsed.data.plateNo,
      model: parsed.data.model,
      capacityKg: String(parsed.data.capacityKg),
    };
    await tx.update(vehicles).set(values).where(eq(vehicles.id, vehicleId)).catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: vehicleId,
      before: { plateNo: before.plateNo, model: before.model, capacityKg: before.capacityKg },
      after: values,
      requestId,
    });
    return { id: vehicleId };
  });
}

export async function setVehicleStatus(vehicleId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = vehicleStatusSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    // A vehicle on a trip in progress keeps IN_TRANSIT until the trip ends.
    const [busy] = (
      await tx.execute(
        sql`SELECT 1 FROM trips WHERE vehicle_id = ${vehicleId} AND status = 'IN_PROGRESS' LIMIT 1`
      )
    ).rows;
    if (busy) throw new AppError("VEHICLE_ON_TRIP", 409, "This vehicle is on a trip in progress.");
    const r = await transition(tx, {
      entity: "vehicle",
      id: vehicleId,
      to: parsed.data.status,
      actor: admin,
      action: "vehicle.status_changed",
      requestId,
    });
    return { from: r.from, to: r.to };
  });
}

export async function createDriverProfile(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = driverProfileSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const [u] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);
    if (!u || u.role !== "driver") {
      throw new AppError("VALIDATION_ERROR", 422, "Choose a user with the driver role.", {
        fields: { userId: ["Choose a user with the driver role"] },
      });
    }
    const defaultVehicleId = await vehicleIdByPlate(tx, parsed.data.defaultVehiclePlate);
    const [row] = await tx
      .insert(drivers)
      .values({ userId: u.id, licenseNo: parsed.data.licenseNo, defaultVehicleId })
      .returning({ id: drivers.id })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "driver.created",
      entityType: "driver",
      entityId: row.id,
      after: {
        userId: u.id,
        licenseNo: parsed.data.licenseNo,
        defaultVehiclePlate: parsed.data.defaultVehiclePlate,
      },
      requestId,
    });
    return row;
  });
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Registers a tracker and returns its device token ONCE (only the SHA-256 is stored, CLAUDE.md §6). The token is
 * shown to the administrator to configure the device; it is never logged or audited.
 */
export async function createTracker(
  raw: unknown,
  requestId?: string
): Promise<{ id: string; deviceId: string; token: string }> {
  const admin = await requireRole("super_admin");
  const parsed = trackerSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const token = randomBytes(32).toString("base64url");
  return inWorkflow(async (tx) => {
    const vehicleId = await vehicleIdByPlate(tx, parsed.data.vehiclePlate);
    const [row] = await tx
      .insert(trackerDevices)
      .values({ deviceId: parsed.data.deviceId, vehicleId, tokenHash: hashToken(token) })
      .returning({ id: trackerDevices.id, deviceId: trackerDevices.deviceId })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "tracker.created",
      entityType: "tracker_device",
      entityId: row.id,
      after: { deviceId: row.deviceId, vehiclePlate: parsed.data.vehiclePlate },
      requestId,
    });
    return { ...row, token };
  });
}

/** Issues a new token for a tracker (the old one stops working immediately). Shown ONCE. */
export async function rotateTrackerToken(
  trackerId: string,
  requestId?: string
): Promise<{ deviceId: string; token: string }> {
  const admin = await requireRole("super_admin");
  const token = randomBytes(32).toString("base64url");
  return inWorkflow(async (tx) => {
    const [row] = await tx
      .update(trackerDevices)
      .set({ tokenHash: hashToken(token) })
      .where(eq(trackerDevices.id, trackerId))
      .returning({ deviceId: trackerDevices.deviceId });
    if (!row) throw new AppError("NOT_FOUND", 404, "Tracker not found.");
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "tracker.token_rotated",
      entityType: "tracker_device",
      entityId: trackerId,
      after: { deviceId: row.deviceId },
      requestId,
    });
    return { deviceId: row.deviceId, token };
  });
}

/**
 * Tracker sign-in for the GPS ingest (CLAUDE.md §6). Unknown device, wrong token and inactive tracker all give the
 * same 401, so a caller cannot probe which device IDs exist. Hashes are compared in constant time.
 */
export async function authenticateTracker(
  tx: DbExecutor,
  deviceId: string,
  token: string
): Promise<{ id: string; vehicleId: string | null }> {
  const [row] = await tx
    .select({
      id: trackerDevices.id,
      vehicleId: trackerDevices.vehicleId,
      tokenHash: trackerDevices.tokenHash,
      active: trackerDevices.active,
    })
    .from(trackerDevices)
    .where(eq(trackerDevices.deviceId, deviceId))
    .limit(1);
  const expected = Buffer.from(row?.tokenHash ?? "0".repeat(64), "hex");
  const given = Buffer.from(hashToken(token), "hex");
  const match = timingSafeEqual(expected, given);
  if (!row || !match || !row.active) {
    throw new AppError("UNAUTHENTICATED", 401, "A valid device ID and device token are required.");
  }
  return { id: row.id, vehicleId: row.vehicleId };
}

/** Moves the tracker's last report time forward (never back). Used by the GPS ingest only. */
export async function markTrackerSeen(tx: DbExecutor, trackerId: string, at: Date): Promise<void> {
  await tx
    .update(trackerDevices)
    .set({
      lastSeenAt: sql`greatest(${trackerDevices.lastSeenAt}, ${at.toISOString()}::timestamptz)`,
    })
    .where(eq(trackerDevices.id, trackerId));
}

/** Adds a licence (a renewal is a new row; history is kept). */
export async function addLicence(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = licenceSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const l = parsed.data;
  return inWorkflow(async (tx) => {
    let subjectId: string | undefined;
    if (l.subjectType === "VEHICLE") {
      subjectId = (await vehicleIdByPlate(tx, l.subjectRef)) ?? undefined;
    } else if (l.subjectType === "DRIVER") {
      const [d] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.licenseNo, l.subjectRef))
        .limit(1);
      subjectId = d?.id;
    } else {
      const [f] = await tx
        .select({ id: facilities.id, type: facilities.type })
        .from(facilities)
        .where(eq(facilities.code, l.subjectRef.toUpperCase()))
        .limit(1);
      if (f && (l.subjectType === "SITE") === (f.type === "DISPOSAL_SITE")) subjectId = f.id;
    }
    if (!subjectId) {
      throw new AppError("VALIDATION_ERROR", 422, "Unknown subject for this licence.", {
        fields: { subjectRef: ["Unknown vehicle plate, driver licence number or facility code"] },
      });
    }
    const [row] = await tx
      .insert(licenses)
      .values({
        subjectType: l.subjectType,
        subjectId,
        kind: l.kind,
        number: l.number,
        issuedOn: l.issuedOn ?? null,
        expiresOn: l.expiresOn,
      })
      .returning({ id: licenses.id })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "licence.added",
      entityType: "licence",
      entityId: row.id,
      after: {
        subjectType: l.subjectType,
        subjectRef: l.subjectRef,
        kind: l.kind,
        number: l.number,
        expiresOn: l.expiresOn,
      },
      requestId,
    });
    return row;
  });
}

/** Activates or deactivates a tracker (no hard deletes). */
export async function setTrackerActive(trackerId: string, active: boolean, requestId?: string) {
  const admin = await requireRole("super_admin");
  return inWorkflow(async (tx) => {
    const [row] = await tx
      .update(trackerDevices)
      .set({ active })
      .where(and(eq(trackerDevices.id, trackerId)))
      .returning({ deviceId: trackerDevices.deviceId });
    if (!row) throw new AppError("NOT_FOUND", 404, "Tracker not found.");
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: active ? "tracker.activated" : "tracker.deactivated",
      entityType: "tracker_device",
      entityId: trackerId,
      after: { deviceId: row.deviceId, active },
      requestId,
    });
    return { deviceId: row.deviceId, active };
  });
}
