import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { ActiveUser } from "@/server/auth/access-rules";
import type { DbExecutor } from "@/server/db/executor";
import { tripStopWaste } from "@/server/db/schema";
import { transition } from "@/server/workflow/engine";
import { cancelActiveOtps } from "./otp";

/**
 * Shared pickup building blocks (CLAUDE.md §5–§6), used by scheduling, driver commands and the completion
 * service. Every status change goes through the Workflow Engine (audited).
 */

type Actor = ActiveUser | null;

/**
 * Takes a stop back before pickup (skip / trip cancel): active OTPs CANCELLED, scans CANCELLED and their
 * containers LABELLED again, waste links released, waste SCHEDULED → REGISTERED (back on the waiting list),
 * stop → SKIPPED with the reason.
 */
export async function releaseStop(
  tx: DbExecutor,
  stopId: string,
  reason: string,
  actor: Actor,
  requestId?: string
): Promise<void> {
  await cancelActiveOtps(tx, stopId);

  const scans = (
    await tx.execute(sql`
      SELECT h.id AS handover_id, h.container_id, c.status AS container_status
      FROM handovers h JOIN containers c ON c.id = h.container_id
      WHERE h.trip_stop_id = ${stopId} AND h.status = 'SCANNED'
      ORDER BY h.scanned_at`)
  ).rows as { handover_id: string; container_id: string; container_status: string }[];
  for (const s of scans) {
    await transition(tx, {
      entity: "handover",
      id: s.handover_id,
      to: "CANCELLED",
      actor,
      requestId,
      action: "handover.cancelled",
    });
    if (s.container_status === "SCANNED_AT_PICKUP") {
      await transition(tx, {
        entity: "container",
        id: s.container_id,
        to: "LABELLED",
        actor,
        requestId,
        action: "container.scan_reset",
      });
    }
  }

  const waste = (
    await tx.execute(sql`
      SELECT w.id FROM trip_stop_waste l JOIN waste_records w ON w.id = l.waste_record_id
      WHERE l.trip_stop_id = ${stopId} AND l.active AND w.status = 'SCHEDULED'
      ORDER BY w.waste_code`)
  ).rows as { id: string }[];
  await tx
    .update(tripStopWaste)
    .set({ active: false })
    .where(and(eq(tripStopWaste.tripStopId, stopId), eq(tripStopWaste.active, true)));
  for (const w of waste) {
    await transition(tx, {
      entity: "waste",
      id: w.id,
      to: "REGISTERED",
      actor,
      requestId,
      action: "waste.unscheduled",
    });
  }

  await transition(tx, { entity: "stop", id: stopId, to: "SKIPPED", actor, reason, requestId });
}

/**
 * Trip IN_PROGRESS → COMPLETED (DECISION v1.2 addendum) when every stop is final AND every collected container
 * has been accounted for at the site (RECEIVED / MISSING / REFUSED / DESTROYED). Vehicle and driver become
 * available again. Receipt (Gate 5) calls this too.
 */
export async function maybeCompleteTrip(
  tx: DbExecutor,
  tripId: string,
  actor: Actor,
  requestId?: string
): Promise<boolean> {
  const [t] = (
    await tx.execute(sql`
      SELECT t.status, t.vehicle_id, t.driver_id,
        (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id AND s.status IN ('PENDING', 'ARRIVED'))::int AS open_stops,
        (SELECT count(*) FROM trip_stops s
           JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
           JOIN containers c ON c.waste_record_id = l.waste_record_id
         WHERE s.trip_id = t.id AND c.status IN ('SCANNED_AT_PICKUP', 'COLLECTED'))::int AS on_board
      FROM trips t WHERE t.id = ${tripId} FOR UPDATE`)
  ).rows as {
    status: string;
    vehicle_id: string;
    driver_id: string;
    open_stops: number;
    on_board: number;
  }[];
  if (!t || t.status !== "IN_PROGRESS" || t.open_stops > 0 || t.on_board > 0) return false;

  await transition(tx, {
    entity: "trip",
    id: tripId,
    to: "COMPLETED",
    actor: null,
    set: { completedAt: new Date() },
    requestId,
  });
  await freeVehicleAndDriver(tx, t.vehicle_id, t.driver_id, requestId);
  return true;
}

/** After a trip ends: vehicle IN_TRANSIT → ACTIVE, driver ON_TRIP → ON_DUTY (system moves, audited). */
export async function freeVehicleAndDriver(
  tx: DbExecutor,
  vehicleId: string,
  driverId: string,
  requestId?: string
): Promise<void> {
  const [v] = (await tx.execute(sql`SELECT status FROM vehicles WHERE id = ${vehicleId}`)).rows as {
    status: string;
  }[];
  if (v?.status === "IN_TRANSIT") {
    await transition(tx, {
      entity: "vehicle",
      id: vehicleId,
      to: "ACTIVE",
      actor: null,
      requestId,
    });
  }
  const [d] = (await tx.execute(sql`SELECT status FROM drivers WHERE id = ${driverId}`)).rows as {
    status: string;
  }[];
  if (d?.status === "ON_TRIP") {
    await transition(tx, { entity: "driver", id: driverId, to: "ON_DUTY", actor: null, requestId });
  }
}
