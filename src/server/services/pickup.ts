import "server-only";
import { sql } from "drizzle-orm";
import { toEatDateString } from "@/lib/dates";
import { otpSchema, reasonSchema, scanSchema } from "@/lib/validation/trip";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { type CommandMeta, runIdempotent } from "@/server/api/command";
import type { DbExecutor } from "@/server/db/executor";
import { handovers } from "@/server/db/schema";
import { writeAudit } from "@/server/audit/writer";
import { AppError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import { transition } from "@/server/workflow/engine";
import { invalid } from "./_errors";
import { expiredLicences } from "./licences";
import { cancelActiveOtps, issueOtp, otpMatches } from "./otp";
import { maybeCompleteTrip, releaseStop } from "./pickup-core";

/**
 * Pickup at the facility (CLAUDE.md §5–§6, architecture §8.3): start trip, arrive (geofence + OTP), scan, verify
 * OTP / in-app confirmation / override — all three through ONE completion service (NO PARTIAL PICKUP), resend,
 * skip. Driver commands are authorized against the CURRENT trip assignment inside the transaction.
 */

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StopCtx {
  stopId: string;
  stopStatus: string;
  facilityId: string;
  facilityName: string;
  facilityLat: number;
  facilityLng: number;
  tripId: string;
  tripCode: string;
  tripStatus: string;
  vehicleId: string;
  driverId: string;
}

/** Locks the stop (and its trip) and returns its context; unknown id → 404. */
async function lockStop(tx: DbExecutor, stopId: string): Promise<StopCtx> {
  if (!UUID.test(stopId)) throw new AppError("NOT_FOUND", 404, "Stop not found.");
  const s = await one<{
    id: string;
    status: string;
    facility_id: string;
    name: string;
    lat: number;
    lng: number;
    trip_id: string;
    trip_code: string;
    trip_status: string;
    vehicle_id: string;
    driver_id: string;
  }>(
    tx,
    sql`SELECT s.id, s.status, s.facility_id, f.name, f.lat, f.lng, t.id AS trip_id, t.trip_code,
               t.status AS trip_status, t.vehicle_id, t.driver_id
        FROM trip_stops s JOIN trips t ON t.id = s.trip_id JOIN facilities f ON f.id = s.facility_id
        WHERE s.id = ${stopId}
        FOR UPDATE OF s, t`
  );
  if (!s) throw new AppError("NOT_FOUND", 404, "Stop not found.");
  return {
    stopId: s.id,
    stopStatus: s.status,
    facilityId: s.facility_id,
    facilityName: s.name,
    facilityLat: Number(s.lat),
    facilityLng: Number(s.lng),
    tripId: s.trip_id,
    tripCode: s.trip_code,
    tripStatus: s.trip_status,
    vehicleId: s.vehicle_id,
    driverId: s.driver_id,
  };
}

/** The driver profile id of a driver user. */
async function driverProfileId(tx: DbExecutor, user: ActiveUser): Promise<string> {
  const d = await one<{ id: string }>(tx, sql`SELECT id FROM drivers WHERE user_id = ${user.id}`);
  if (!d) throw new AppError("FORBIDDEN", 403, "Your account has no driver profile.");
  return d.id;
}

/** Driver commands: the stop's trip must be IN_PROGRESS and assigned to THIS driver right now. */
async function lockDriverStop(tx: DbExecutor, user: ActiveUser, stopId: string): Promise<StopCtx> {
  const ctx = await lockStop(tx, stopId);
  if (ctx.driverId !== (await driverProfileId(tx, user))) {
    throw new AppError("NOT_ASSIGNED", 403, "This stop is not on a trip assigned to you.");
  }
  if (ctx.tripStatus !== "IN_PROGRESS")
    throw new AppError("TRIP_NOT_STARTED", 409, "Start the trip first.");
  return ctx;
}

/** Expected containers of a stop and which of them are not (validly) scanned at THIS stop. */
async function scanState(tx: DbExecutor, stopId: string, lock = false) {
  const containers = await all<{
    id: string;
    container_code: string;
    status: string;
    scanned: boolean;
  }>(
    tx,
    sql`SELECT c.id, c.container_code, c.status,
               EXISTS (SELECT 1 FROM handovers h WHERE h.trip_stop_id = ${stopId} AND h.container_id = c.id
                       AND h.status = 'SCANNED') AS scanned
        FROM trip_stop_waste l JOIN containers c ON c.waste_record_id = l.waste_record_id
        WHERE l.trip_stop_id = ${stopId} AND l.active
        ORDER BY c.container_code
        ${lock ? sql`FOR UPDATE OF c` : sql``}`
  );
  const missing = containers.filter((c) => !c.scanned || c.status !== "SCANNED_AT_PICKUP");
  return {
    containers,
    expected: containers.length,
    scanned: containers.length - missing.length,
    missing,
  };
}

function assertComplete(state: Awaited<ReturnType<typeof scanState>>) {
  if (state.expected === 0)
    throw new AppError("NOTHING_TO_COLLECT", 409, "No waste is linked to this stop.");
  if (state.missing.length > 0) {
    throw new AppError(
      "INCOMPLETE_SCAN",
      409,
      `Scan every container first: ${state.scanned} of ${state.expected} scanned. If containers cannot be collected, skip the stop.`,
      {
        missing: state.missing.map((c) => c.container_code),
        scanned: state.scanned,
        expected: state.expected,
      }
    );
  }
}

/**
 * THE completion service (CLAUDE.md §6): locks and re-checks the stop and every expected container, rejects a
 * partial pickup, then atomically sets all containers COLLECTED, the stop COLLECTED / COLLECTED_OVERRIDE and the
 * waste IN_TRANSIT. Used by OTP verification, in-app confirmation and the super_admin override.
 */
export async function completeStop(
  tx: DbExecutor,
  stopId: string,
  method: "OTP" | "IN_APP" | "OVERRIDE",
  actor: ActiveUser,
  opts: { reason?: string; requestId?: string } = {}
) {
  const ctx = await lockStop(tx, stopId);
  if (ctx.stopStatus !== "ARRIVED") {
    throw new AppError(
      "INVALID_TRANSITION",
      409,
      `This stop is ${ctx.stopStatus.toLowerCase()}, not waiting for handover.`
    );
  }
  const state = await scanState(tx, stopId, true);
  assertComplete(state);

  for (const c of state.containers) {
    await transition(tx, {
      entity: "container",
      id: c.id,
      to: "COLLECTED",
      actor,
      requestId: opts.requestId,
      action: "container.collected",
    });
  }
  await cancelActiveOtps(tx, stopId);
  await transition(tx, {
    entity: "stop",
    id: stopId,
    to: method === "OVERRIDE" ? "COLLECTED_OVERRIDE" : "COLLECTED",
    actor,
    reason: opts.reason,
    set: { collectionMethod: method, confirmedBy: actor.id, completedAt: new Date() },
    action: method === "OVERRIDE" ? "stop.override" : "stop.collected",
    requestId: opts.requestId,
  });
  const waste = await all<{ id: string }>(
    tx,
    sql`SELECT w.id FROM trip_stop_waste l JOIN waste_records w ON w.id = l.waste_record_id
        WHERE l.trip_stop_id = ${stopId} AND l.active ORDER BY w.waste_code`
  );
  for (const w of waste) {
    await transition(tx, {
      entity: "waste",
      id: w.id,
      to: "IN_TRANSIT",
      actor,
      requestId: opts.requestId,
      action: "waste.collected",
    });
  }
  await maybeCompleteTrip(tx, ctx.tripId, actor, opts.requestId);
  return {
    stopId,
    status: method === "OVERRIDE" ? "COLLECTED_OVERRIDE" : "COLLECTED",
    method,
    containers: state.expected,
  };
}

// ---------------------------------------------------------------- 3.6 start + arrive

/** Driver starts the assigned trip on its planned day: licences valid, one active trip per vehicle / driver. */
export async function startTrip(tripId: string, meta: CommandMeta) {
  const user = await requireRole("driver");
  return runIdempotent(user, `POST /api/trips/${tripId}/start`, meta, {}, async (tx) => {
    if (!UUID.test(tripId)) throw new AppError("NOT_FOUND", 404, "Trip not found.");
    const t = await one<{
      id: string;
      trip_code: string;
      status: string;
      planned_date: string;
      vehicle_id: string;
      driver_id: string;
      vehicle_status: string;
    }>(
      tx,
      sql`SELECT t.id, t.trip_code, t.status, to_char(t.planned_date, 'YYYY-MM-DD') AS planned_date,
                 t.vehicle_id, t.driver_id, v.status AS vehicle_status
          FROM trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ${tripId} FOR UPDATE OF t, v`
    );
    if (!t) throw new AppError("NOT_FOUND", 404, "Trip not found.");
    if (t.driver_id !== (await driverProfileId(tx, user)))
      throw new AppError("NOT_ASSIGNED", 403, "This trip is not assigned to you.");
    const today = toEatDateString(new Date());
    // ASSUMPTION: a trip starts on its planned day (EAT).
    if (t.status === "PLANNED" && t.planned_date !== today) {
      throw new AppError("NOT_TODAY", 409, `This trip is planned for ${t.planned_date}.`);
    }
    if (t.vehicle_status === "MAINTENANCE" || t.vehicle_status === "OFFLINE") {
      throw new AppError("VEHICLE_UNAVAILABLE", 409, "The vehicle is not available.");
    }
    const expired = await expiredLicences(
      tx,
      [
        { type: "VEHICLE", id: t.vehicle_id },
        { type: "DRIVER", id: t.driver_id },
      ],
      today
    );
    if (expired.length) {
      throw new AppError(
        "LICENCE_EXPIRED",
        409,
        `An expired licence blocks the trip: ${expired.map((e) => `${e.kind} ${e.number}`).join("; ")}.`,
        { expired }
      );
    }
    const busy = await one<{ trip_code: string }>(
      tx,
      sql`SELECT trip_code FROM trips WHERE status = 'IN_PROGRESS' AND id <> ${tripId}
            AND (vehicle_id = ${t.vehicle_id} OR driver_id = ${t.driver_id}) LIMIT 1`
    );
    if (busy)
      throw new AppError("ALREADY_ON_TRIP", 409, `Trip ${busy.trip_code} is still in progress.`);

    await transition(tx, {
      entity: "trip",
      id: tripId,
      to: "IN_PROGRESS",
      actor: user,
      set: { startedAt: new Date() },
      requestId: meta.requestId,
      action: "trip.started",
    });
    if (t.vehicle_status !== "IN_TRANSIT") {
      await transition(tx, {
        entity: "vehicle",
        id: t.vehicle_id,
        to: "IN_TRANSIT",
        actor: null,
        requestId: meta.requestId,
      });
    }
    const d = await one<{ status: string }>(
      tx,
      sql`SELECT status FROM drivers WHERE id = ${t.driver_id}`
    );
    if (d?.status !== "ON_TRIP") {
      await transition(tx, {
        entity: "driver",
        id: t.driver_id,
        to: "ON_TRIP",
        actor: null,
        requestId: meta.requestId,
      });
    }
    return { tripId, tripCode: t.trip_code, status: "IN_PROGRESS" };
  });
}

/** Great-circle distance in metres. */
export function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Arrival: geofence evidence (never blocks; no recent GPS → null), stop ARRIVED, OTP via the outbox. */
export async function arriveAtStop(stopId: string, meta: CommandMeta) {
  const user = await requireRole("driver");
  return runIdempotent(user, `POST /api/stops/${stopId}/arrive`, meta, {}, async (tx) => {
    const ctx = await lockDriverStop(tx, user, stopId);
    const open = await one<{ id: string }>(
      tx,
      sql`SELECT id FROM trip_stops WHERE trip_id = ${ctx.tripId} AND status = 'ARRIVED' AND id <> ${stopId} LIMIT 1`
    );
    if (open)
      throw new AppError("ANOTHER_STOP_OPEN", 409, "Finish or skip the stop you are at first.");

    const [radius, silentMinutes] = await Promise.all([
      getSetting("geofence_radius_m", tx),
      getSetting("tracker_silent_minutes", tx),
    ]);
    const gps = await one<{ lat: number; lng: number }>(
      tx,
      sql`SELECT lat, lng FROM gps_events WHERE vehicle_id = ${ctx.vehicleId}
            AND recorded_at >= now() - make_interval(mins => ${silentMinutes})
          ORDER BY recorded_at DESC LIMIT 1`
    );
    const distance = gps
      ? distanceMetres(
          { lat: Number(gps.lat), lng: Number(gps.lng) },
          { lat: ctx.facilityLat, lng: ctx.facilityLng }
        )
      : null;
    const geofenceOk = distance === null ? null : distance <= radius;

    await transition(tx, {
      entity: "stop",
      id: stopId,
      to: "ARRIVED",
      actor: user,
      set: { arrivedAt: new Date(), arrivalDistanceM: distance, geofenceOk },
      action: "stop.arrived",
      requestId: meta.requestId,
    });
    const otp = await issueOtp(
      tx,
      { id: stopId, facilityId: ctx.facilityId, facilityName: ctx.facilityName },
      user,
      meta.requestId
    );
    const state = await scanState(tx, stopId);
    return {
      stopId,
      status: "ARRIVED",
      geofenceOk,
      distanceM: distance,
      otpIssued: otp.issued,
      otpRecipients: otp.recipientCount,
      otpExpiresAt: otp.expiresAt?.toISOString() ?? null,
      expected: state.expected,
      scanned: state.scanned,
    };
  });
}

// ---------------------------------------------------------------- 3.7 scan

/** One container scan = evidence only (handover SCANNED + container SCANNED_AT_PICKUP); never completes the stop. */
export async function scanContainer(stopId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireRole("driver");
  const parsed = scanSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const code = parsed.data.containerCode;
  return runIdempotent(user, `POST /api/stops/${stopId}/scan`, meta, parsed.data, async (tx) => {
    const ctx = await lockDriverStop(tx, user, stopId);
    if (ctx.stopStatus !== "ARRIVED")
      throw new AppError("NOT_ARRIVED", 409, "Mark the arrival first.");
    const c = await one<{ id: string; status: string; on_stop: boolean; scanned_here: boolean }>(
      tx,
      sql`SELECT c.id, c.status,
                 EXISTS (SELECT 1 FROM trip_stop_waste l WHERE l.trip_stop_id = ${stopId}
                         AND l.waste_record_id = c.waste_record_id AND l.active) AS on_stop,
                 EXISTS (SELECT 1 FROM handovers h WHERE h.trip_stop_id = ${stopId} AND h.container_id = c.id) AS scanned_here
          FROM containers c WHERE c.container_code = ${code} FOR UPDATE OF c`
    );
    if (!c) throw new AppError("UNKNOWN_CONTAINER", 404, `${code} is not a known container.`);
    if (!c.on_stop)
      throw new AppError("CONTAINER_NOT_ON_STOP", 409, `${code} does not belong to this pickup.`);
    if (c.scanned_here || c.status !== "LABELLED") {
      throw new AppError("ALREADY_SCANNED", 409, `${code} has already been scanned.`);
    }
    const driverId = await driverProfileId(tx, user);
    await tx.insert(handovers).values({
      tripStopId: stopId,
      containerId: c.id,
      driverId,
      idempotencyKey: meta.idempotencyKey,
    });
    await transition(tx, {
      entity: "container",
      id: c.id,
      to: "SCANNED_AT_PICKUP",
      actor: user,
      action: "container.scanned",
      requestId: meta.requestId,
    });
    const state = await scanState(tx, stopId);
    return { stopId, containerCode: code, scanned: state.scanned, expected: state.expected };
  });
}

// ---------------------------------------------------------------- 3.8 verify OTP

/**
 * Verify the pickup code. Scans are checked first (a code is never used up on an incomplete pickup). A wrong code
 * counts an attempt (LOCKED at `otp_max_attempts`); an expired code becomes EXPIRED — both are COMMITTED and then
 * reported as errors. A correct code → OTP VERIFIED + completion (method OTP).
 */
type VerifyOutcome =
  | { ok: true; stopId: string; status: string; method: string; containers: number }
  | { ok: false; code: string; status: number; message: string; attemptsLeft: number | null };

export async function verifyOtp(stopId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireRole("driver");
  const parsed = otpSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  // The typed code is never stored with the idempotency key (only a placeholder).
  const outcome = await runIdempotent(
    user,
    `POST /api/stops/${stopId}/verify-otp`,
    meta,
    { code: "******" },
    async (tx): Promise<VerifyOutcome> => {
      const ctx = await lockDriverStop(tx, user, stopId);
      if (ctx.stopStatus !== "ARRIVED") {
        throw new AppError("INVALID_TRANSITION", 409, "This stop is not waiting for a code.");
      }
      assertComplete(await scanState(tx, stopId));
      const otp = await one<{ id: string; code_hash: string; attempts: number; expires_at: Date }>(
        tx,
        sql`SELECT id, code_hash, attempts, expires_at FROM otp_codes
            WHERE trip_stop_id = ${stopId} AND status = 'ISSUED' FOR UPDATE`
      );
      if (!otp) {
        return {
          ok: false,
          code: "NO_ACTIVE_OTP",
          status: 409,
          message: "No active code. Send a new code, or ask the hospital to confirm in the app.",
          attemptsLeft: null,
        };
      }
      if (new Date(otp.expires_at) <= new Date()) {
        await transition(tx, {
          entity: "otp",
          id: otp.id,
          to: "EXPIRED",
          actor: user,
          action: "otp.expired",
          requestId: meta.requestId,
        });
        return {
          ok: false,
          code: "OTP_EXPIRED",
          status: 409,
          message: "The code has expired. Send a new code.",
          attemptsLeft: null,
        };
      }
      if (!otpMatches(parsed.data.code, stopId, otp.code_hash)) {
        const max = await getSetting("otp_max_attempts", tx);
        const attempts = otp.attempts + 1;
        await tx.execute(sql`UPDATE otp_codes SET attempts = ${attempts} WHERE id = ${otp.id}`);
        await writeAudit(tx, {
          actor: { userId: user.id, role: user.role },
          action: "otp.failed",
          entityType: "otp_code",
          entityId: otp.id,
          after: { attempts, attemptsLeft: Math.max(max - attempts, 0) },
          requestId: meta.requestId,
        });
        if (attempts >= max) {
          await transition(tx, {
            entity: "otp",
            id: otp.id,
            to: "LOCKED",
            actor: user,
            action: "otp.locked",
            requestId: meta.requestId,
          });
          return {
            ok: false,
            code: "OTP_LOCKED",
            status: 423,
            message:
              "Too many wrong codes; the code is locked. Send a new code or use in-app confirmation.",
            attemptsLeft: 0,
          };
        }
        return {
          ok: false,
          code: "OTP_INVALID",
          status: 422,
          message: `Wrong code. ${max - attempts} attempt(s) left.`,
          attemptsLeft: max - attempts,
        };
      }
      await transition(tx, {
        entity: "otp",
        id: otp.id,
        to: "VERIFIED",
        actor: user,
        set: { verifiedAt: new Date() },
        action: "otp.verified",
        requestId: meta.requestId,
      });
      return {
        ok: true,
        ...(await completeStop(tx, stopId, "OTP", user, { requestId: meta.requestId })),
      };
    }
  );
  // Failed attempts / expiry are committed above; now report them as errors.
  if (!outcome.ok) {
    throw new AppError(outcome.code, outcome.status, outcome.message, {
      attemptsLeft: outcome.attemptsLeft,
    });
  }
  return outcome;
}

// ---------------------------------------------------------------- 3.9 resend + skip

/** New code after the cooldown, at most `otp_max_per_stop` per stop (then in-app or override only). */
export async function resendOtp(stopId: string, meta: CommandMeta) {
  const user = await requireRole("driver");
  return runIdempotent(user, `POST /api/stops/${stopId}/resend-otp`, meta, {}, async (tx) => {
    const ctx = await lockDriverStop(tx, user, stopId);
    if (ctx.stopStatus !== "ARRIVED")
      throw new AppError("NOT_ARRIVED", 409, "Mark the arrival first.");
    const cooldown = await getSetting("otp_resend_cooldown_seconds", tx);
    const last = await one<{ age: number }>(
      tx,
      sql`SELECT extract(epoch FROM now() - max(created_at))::int AS age FROM otp_codes WHERE trip_stop_id = ${stopId}`
    );
    if (last?.age !== null && last?.age !== undefined && last.age < cooldown) {
      throw new AppError(
        "OTP_COOLDOWN",
        429,
        `Wait ${cooldown - last.age} s before sending a new code.`,
        { retryAfterSeconds: cooldown - last.age }
      );
    }
    const otp = await issueOtp(
      tx,
      { id: stopId, facilityId: ctx.facilityId, facilityName: ctx.facilityName },
      user,
      meta.requestId
    );
    if (!otp.issued)
      throw new AppError(
        "NO_RECIPIENTS",
        409,
        "Nobody at this facility receives pickup codes. Ask for in-app confirmation."
      );
    return {
      stopId,
      otpRecipients: otp.recipientCount,
      otpExpiresAt: otp.expiresAt!.toISOString(),
    };
  });
}

/** Skip (driver of the current trip, or super_admin) with a reason: everything taken back, waste waits again. */
export async function skipStop(stopId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireRole("driver", "super_admin");
  const parsed = reasonSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return runIdempotent(user, `POST /api/stops/${stopId}/skip`, meta, parsed.data, async (tx) => {
    const ctx =
      user.role === "driver" ? await lockDriverStop(tx, user, stopId) : await lockStop(tx, stopId);
    if (ctx.stopStatus !== "PENDING" && ctx.stopStatus !== "ARRIVED") {
      throw new AppError(
        "INVALID_TRANSITION",
        409,
        `This stop is already ${ctx.stopStatus.toLowerCase()}.`
      );
    }
    await releaseStop(tx, stopId, parsed.data.reason, user, meta.requestId);
    const tripCompleted = await maybeCompleteTrip(tx, ctx.tripId, user, meta.requestId);
    return { stopId, status: "SKIPPED", tripCompleted };
  });
}

// ---------------------------------------------------------------- 3.10 in-app + 3.11 override

/** A hospital user of the SAME facility confirms the handover in the app (fallback when SMS fails). */
export async function confirmHandover(stopId: string, meta: CommandMeta) {
  const user = await requireRole("hospital_admin", "hospital_staff");
  return runIdempotent(user, `POST /api/stops/${stopId}/confirm-handover`, meta, {}, async (tx) => {
    const ctx = await lockStop(tx, stopId);
    if (ctx.facilityId !== user.facilityId) throw new AppError("NOT_FOUND", 404, "Stop not found.");
    if (ctx.stopStatus !== "ARRIVED")
      throw new AppError("INVALID_TRANSITION", 409, "The truck is not at your door.");
    return completeStop(tx, stopId, "IN_APP", user, { requestId: meta.requestId });
  });
}

/** super_admin override with a written reason; every expected container must still be scanned. */
export async function overrideStop(stopId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireRole("super_admin");
  const parsed = reasonSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return runIdempotent(user, `POST /api/stops/${stopId}/override`, meta, parsed.data, async (tx) =>
    completeStop(tx, stopId, "OVERRIDE", user, {
      reason: parsed.data.reason,
      requestId: meta.requestId,
    })
  );
}
