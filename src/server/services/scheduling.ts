import "server-only";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import { reassignSchema, tripPlanSchema } from "@/lib/validation/trip";
import { writeAudit } from "@/server/audit/writer";

import { requireRole } from "@/server/auth/current-user";
import { nextCode } from "@/server/db/codes";
import type { DbExecutor } from "@/server/db/executor";
import { tripStopWaste, tripStops, trips } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { getSetting } from "@/server/services/settings";
import { inWorkflow, transition } from "@/server/workflow/engine";
import { type CommandMeta, runIdempotent } from "@/server/api/command";
import { invalid } from "./_errors";
import { expiredLicences, type LicenceSubject } from "./licences";
import { cancelActiveOtps } from "./otp";
import { freeVehicleAndDriver, releaseStop } from "./pickup-core";

/**
 * Trip scheduling (CLAUDE.md §5–§6, architecture §8.2): super_admin plans trips from the waiting list, cancels
 * and reassigns them. Guards: facility ACTIVE and ready (≥ 1 OTP recipient), no expired licence (vehicle, driver,
 * facility, site) on the planned date, at most `max_trip_stops` stops, vehicle / driver not on another open trip
 * that day. In one transaction: trip PLANNED, stops PENDING, waste → SCHEDULED, audit, outbox email to the driver.
 */

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];

interface VehicleRow {
  id: string;
  plate_no: string;
  status: string;
  active: boolean;
}
interface DriverRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  active: boolean;
}

async function loadVehicle(tx: DbExecutor, id: string): Promise<VehicleRow> {
  const v = await one<VehicleRow>(
    tx,
    sql`SELECT id, plate_no, status, active FROM vehicles WHERE id = ${id} FOR UPDATE`
  );
  if (!v)
    throw new AppError("VALIDATION_ERROR", 422, "Unknown vehicle.", {
      fields: { vehicleId: ["Unknown vehicle"] },
    });
  if (!v.active || v.status === "MAINTENANCE" || v.status === "OFFLINE") {
    throw new AppError(
      "VEHICLE_UNAVAILABLE",
      409,
      `Vehicle ${v.plate_no} is not available (${v.status.toLowerCase()}).`
    );
  }
  return v;
}

async function loadDriver(tx: DbExecutor, id: string): Promise<DriverRow> {
  const d = await one<DriverRow>(
    tx,
    sql`SELECT d.id, d.user_id, u.full_name, u.email, u.active
        FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = ${id} FOR UPDATE OF d`
  );
  if (!d)
    throw new AppError("VALIDATION_ERROR", 422, "Unknown driver.", {
      fields: { driverId: ["Unknown driver"] },
    });
  if (!d.active)
    throw new AppError("DRIVER_UNAVAILABLE", 409, `${d.full_name} cannot sign in (inactive).`);
  return d;
}

/** Another open (PLANNED / IN_PROGRESS) trip on the same day for this vehicle or driver. */
async function assertFree(
  tx: DbExecutor,
  date: string,
  vehicleId: string,
  driverId: string,
  exceptTripId?: string
) {
  const clash = await one<{ trip_code: string; vehicle_id: string }>(
    tx,
    sql`SELECT trip_code, vehicle_id FROM trips
        WHERE planned_date = ${date}::date AND status IN ('PLANNED', 'IN_PROGRESS')
          AND (vehicle_id = ${vehicleId} OR driver_id = ${driverId})
          AND id IS DISTINCT FROM ${exceptTripId ?? null}::uuid
        LIMIT 1`
  );
  if (clash) {
    const what = clash.vehicle_id === vehicleId ? "vehicle" : "driver";
    throw new AppError(
      "ALREADY_ASSIGNED",
      409,
      `The ${what} already has trip ${clash.trip_code} on ${date}.`
    );
  }
}

async function assertLicences(tx: DbExecutor, subjects: LicenceSubject[], date: string) {
  const expired = await expiredLicences(tx, subjects, date);
  if (expired.length) {
    throw new AppError(
      "LICENCE_EXPIRED",
      409,
      `An expired licence blocks this trip: ${expired.map((e) => `${e.kind} ${e.number} (expired ${e.expiresOn})`).join("; ")}.`,
      { expired }
    );
  }
}

async function siteSubjects(tx: DbExecutor): Promise<LicenceSubject[]> {
  return (
    await all<{ id: string }>(tx, sql`SELECT id FROM facilities WHERE type = 'DISPOSAL_SITE'`)
  ).map((s) => ({
    type: "SITE" as const,
    id: s.id,
  }));
}

async function notifyDriver(
  tx: DbExecutor,
  driver: DriverRow,
  trip: { code: string; date: string; plate: string },
  change: "NEW" | "REASSIGNED" | "CANCELLED"
) {
  const stops = await all<{ name: string }>(
    tx,
    sql`SELECT f.name FROM trip_stops s JOIN trips t ON t.id = s.trip_id JOIN facilities f ON f.id = s.facility_id
        WHERE t.trip_code = ${trip.code} ORDER BY s.priority_order`
  );
  await enqueueMessage(tx, {
    template: "trip.assigned",
    recipient: driver.email,
    data: {
      tripCode: trip.code,
      plannedDate: trip.date,
      vehiclePlate: trip.plate,
      stops: stops.length ? stops.map((s) => s.name) : ["—"],
      change,
    },
  });
}

export async function createTrip(
  raw: unknown,
  requestId?: string
): Promise<{ id: string; tripCode: string }> {
  const admin = await requireRole("super_admin");
  const parsed = tripPlanSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const input = parsed.data;
  const today = toEatDateString(new Date());
  if (input.plannedDate < today) {
    throw new AppError("VALIDATION_ERROR", 422, "The date is in the past.", {
      fields: { plannedDate: ["Choose today or a later date"] },
    });
  }
  const codes = input.stops.map((s) => s.facilityCode);
  if (new Set(codes).size !== codes.length) {
    throw new AppError("VALIDATION_ERROR", 422, "A facility can appear only once in a trip.", {
      fields: { stops: ["Duplicate facility"] },
    });
  }

  return inWorkflow(async (tx) => {
    const maxStops = await getSetting("max_trip_stops", tx);
    if (codes.length > maxStops) {
      throw new AppError("VALIDATION_ERROR", 422, `At most ${maxStops} stops per trip.`, {
        fields: { stops: [`At most ${maxStops} stops`] },
      });
    }
    const vehicle = await loadVehicle(tx, input.vehicleId);
    const driver = await loadDriver(tx, input.driverId);
    await assertFree(tx, input.plannedDate, vehicle.id, driver.id);

    const facilities = await all<{
      id: string;
      code: string;
      name: string;
      type: string;
      status: string;
      recipients: number;
    }>(
      tx,
      sql`SELECT f.id, f.code, f.name, f.type, f.status,
                 (SELECT count(*)::int FROM users u WHERE u.facility_id = f.id AND u.active AND u.phone_verified
                    AND u.receives_pickup_otp AND u.role IN ('hospital_admin', 'hospital_staff')) AS recipients
          FROM facilities f WHERE f.code IN (${sql.join(
            codes.map((c) => sql`${c}`),
            sql`, `
          )})`
    );
    const byCode = new Map(facilities.map((f) => [f.code, f]));
    for (const code of codes) {
      const f = byCode.get(code);
      if (!f || f.type === "DISPOSAL_SITE")
        throw new AppError("VALIDATION_ERROR", 422, `Unknown facility ${code}.`, {
          fields: { stops: [`Unknown facility ${code}`] },
        });
      if (f.status !== "ACTIVE")
        throw new AppError("FACILITY_NOT_ACTIVE", 409, `${f.name} is not active.`);
      if (f.recipients === 0) {
        throw new AppError(
          "FACILITY_NOT_READY",
          409,
          `${f.name} is not ready: nobody there receives pickup codes.`,
          { facility: code }
        );
      }
    }
    await assertLicences(
      tx,
      [
        { type: "VEHICLE", id: vehicle.id },
        { type: "DRIVER", id: driver.id },
        ...facilities.map((f) => ({ type: "FACILITY" as const, id: f.id })),
        ...(await siteSubjects(tx)),
      ],
      input.plannedDate
    );

    // Waiting waste per facility, locked so a parallel plan cannot take the same records.
    const waiting = await all<{ id: string; facility_id: string }>(
      tx,
      sql`SELECT w.id, w.facility_id FROM waste_records w
          WHERE w.facility_id IN (${sql.join(
            facilities.map((f) => sql`${f.id}`),
            sql`, `
          )})
            AND w.status = 'REGISTERED'
            AND NOT EXISTS (SELECT 1 FROM trip_stop_waste l WHERE l.waste_record_id = w.id AND l.active)
          ORDER BY w.created_at
          FOR UPDATE OF w`
    );
    for (const code of codes) {
      if (!waiting.some((w) => w.facility_id === byCode.get(code)!.id)) {
        throw new AppError(
          "NOTHING_TO_COLLECT",
          409,
          `${byCode.get(code)!.name} has no waste waiting for pickup.`,
          { facility: code }
        );
      }
    }

    const tripCode = await nextCode(tx, "trip", new Date(`${input.plannedDate}T09:00:00Z`));
    const [trip] = await tx
      .insert(trips)
      .values({
        tripCode,
        vehicleId: vehicle.id,
        driverId: driver.id,
        plannedDate: input.plannedDate,
        createdBy: admin.id,
      })
      .returning({ id: trips.id });
    for (let i = 0; i < codes.length; i++) {
      const f = byCode.get(codes[i])!;
      const [stop] = await tx
        .insert(tripStops)
        .values({ tripId: trip.id, facilityId: f.id, priorityOrder: i + 1 })
        .returning({ id: tripStops.id });
      for (const w of waiting.filter((x) => x.facility_id === f.id)) {
        await tx.insert(tripStopWaste).values({ tripStopId: stop.id, wasteRecordId: w.id });
        await transition(tx, {
          entity: "waste",
          id: w.id,
          to: "SCHEDULED",
          actor: admin,
          requestId,
          action: "waste.scheduled",
        });
      }
    }
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "trip.created",
      entityType: "trip",
      entityId: trip.id,
      after: {
        tripCode,
        plannedDate: input.plannedDate,
        vehicle: vehicle.plate_no,
        driverId: driver.id,
        stops: codes,
        waste: waiting.length,
      },
      requestId,
    });
    await notifyDriver(
      tx,
      driver,
      { code: tripCode, date: input.plannedDate, plate: vehicle.plate_no },
      "NEW"
    );
    return { id: trip.id, tripCode };
  });
}

interface TripRow {
  id: string;
  trip_code: string;
  status: string;
  planned_date: string;
  vehicle_id: string;
  driver_id: string;
  plate_no: string;
}

async function lockTrip(tx: DbExecutor, tripId: string): Promise<TripRow> {
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new AppError("NOT_FOUND", 404, "Trip not found.");
  const t = await one<TripRow>(
    tx,
    sql`SELECT t.id, t.trip_code, t.status, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date,
               t.vehicle_id, t.driver_id, v.plate_no
        FROM trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ${tripId} FOR UPDATE OF t`
  );
  if (!t) throw new AppError("NOT_FOUND", 404, "Trip not found.");
  return t;
}

/** 3.4 — Cancel (super_admin, reason): PLANNED, or IN_PROGRESS with no stop ARRIVED and nothing collected. */
export async function cancelTrip(tripId: string, input: { reason: string }, meta: CommandMeta) {
  const admin = await requireRole("super_admin");
  return runIdempotent(admin, `POST /api/trips/${tripId}/cancel`, meta, input, async (tx) => {
    const trip = await lockTrip(tx, tripId);
    const blocking = await one<{ n: number }>(
      tx,
      sql`SELECT count(*)::int AS n FROM trip_stops WHERE trip_id = ${tripId}
            AND status IN ('ARRIVED', 'COLLECTED', 'COLLECTED_OVERRIDE')`
    );
    if (trip.status === "IN_PROGRESS" && blocking!.n > 0) {
      throw new AppError(
        "TRIP_HAS_PICKUPS",
        409,
        "A stop has started or been collected; skip the remaining stops instead."
      );
    }
    const open = await all<{ id: string }>(
      tx,
      sql`SELECT id FROM trip_stops WHERE trip_id = ${tripId} AND status = 'PENDING' ORDER BY priority_order`
    );
    // The engine refuses anything but PLANNED / IN_PROGRESS → CANCELLED (409), before stops are touched.
    await transition(tx, {
      entity: "trip",
      id: tripId,
      to: "CANCELLED",
      actor: admin,
      reason: input.reason,
      requestId: meta.requestId,
    });
    for (const s of open)
      await releaseStop(tx, s.id, `Trip cancelled: ${input.reason}`, admin, meta.requestId);
    if (trip.status === "IN_PROGRESS")
      await freeVehicleAndDriver(tx, trip.vehicle_id, trip.driver_id, meta.requestId);
    const driver = await loadDriverAnyState(tx, trip.driver_id);
    await notifyDriver(
      tx,
      driver,
      { code: trip.trip_code, date: trip.planned_date, plate: trip.plate_no },
      "CANCELLED"
    );
    return { tripCode: trip.trip_code, status: "CANCELLED" };
  });
}

async function loadDriverAnyState(tx: DbExecutor, id: string): Promise<DriverRow> {
  const d = await one<DriverRow>(
    tx,
    sql`SELECT d.id, d.user_id, u.full_name, u.email, u.active FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = ${id}`
  );
  if (!d) throw new AppError("NOT_FOUND", 404, "Driver not found.");
  return d;
}

/**
 * 3.4 — Reassign vehicle and/or driver (super_admin, PLANNED only): same guards as planning; active OTPs of the
 * trip are cancelled; the former driver loses access at once (driver queries filter by the current assignment).
 */
export async function reassignTrip(tripId: string, raw: unknown, meta: CommandMeta) {
  const admin = await requireRole("super_admin");
  const parsed = reassignSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return runIdempotent(
    admin,
    `POST /api/trips/${tripId}/reassign`,
    meta,
    parsed.data,
    async (tx) => {
      const trip = await lockTrip(tx, tripId);
      if (trip.status !== "PLANNED") {
        throw new AppError("INVALID_TRANSITION", 409, "Only a planned trip can be reassigned.");
      }
      const vehicle = await loadVehicle(tx, parsed.data.vehicleId ?? trip.vehicle_id);
      const driver = await loadDriver(tx, parsed.data.driverId ?? trip.driver_id);
      if (vehicle.id === trip.vehicle_id && driver.id === trip.driver_id) {
        throw new AppError("VALIDATION_ERROR", 422, "Nothing changes.", {
          fields: { vehicleId: ["Choose a different vehicle or driver"] },
        });
      }
      await assertFree(tx, trip.planned_date, vehicle.id, driver.id, tripId);
      await assertLicences(
        tx,
        [
          { type: "VEHICLE", id: vehicle.id },
          { type: "DRIVER", id: driver.id },
        ],
        trip.planned_date
      );

      const stops = await all<{ id: string }>(
        tx,
        sql`SELECT id FROM trip_stops WHERE trip_id = ${tripId}`
      );
      let otpsCancelled = 0;
      for (const s of stops) otpsCancelled += await cancelActiveOtps(tx, s.id);

      await tx.execute(
        sql`UPDATE trips SET vehicle_id = ${vehicle.id}, driver_id = ${driver.id} WHERE id = ${tripId}`
      );
      await writeAudit(tx, {
        actor: { userId: admin.id, role: admin.role },
        action: "trip.reassigned",
        entityType: "trip",
        entityId: tripId,
        before: { vehicleId: trip.vehicle_id, driverId: trip.driver_id },
        after: { vehicleId: vehicle.id, driverId: driver.id, otpsCancelled },
        requestId: meta.requestId,
      });
      const ref = { code: trip.trip_code, date: trip.planned_date, plate: vehicle.plate_no };
      await notifyDriver(tx, driver, ref, "REASSIGNED");
      if (driver.id !== trip.driver_id) {
        await notifyDriver(tx, await loadDriverAnyState(tx, trip.driver_id), ref, "CANCELLED");
      }
      return {
        tripCode: trip.trip_code,
        vehiclePlate: vehicle.plate_no,
        driverName: driver.full_name,
      };
    }
  );
}
