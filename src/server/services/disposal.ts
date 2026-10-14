import "server-only";
import { sql } from "drizzle-orm";
import {
  closeNoDestructionSchema,
  containerExceptionSchema,
  destroySchema,
  receiveSchema,
} from "@/lib/validation/disposal";
import { type CommandMeta, runIdempotent } from "@/server/api/command";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import { transition } from "@/server/workflow/engine";
import { invalid } from "./_errors";
import { createPendingCertificate, generateAfterCommit } from "./certificates";
import { maybeCompleteTrip } from "./pickup-core";

/**
 * Disposal site (CLAUDE.md §5–§6, Gate 5.1 / 5.2). Operator of the DISPOSAL_SITE only (DECISION v1.2 addendum).
 * - Receipt: each collected container becomes RECEIVED, MISSING or REFUSED (reason). When none of a waste record's
 *   containers is still COLLECTED, the waste moves IN_TRANSIT → RECEIVED; when nothing is left on the truck, the
 *   trip completes (DECISION v1.2: all stops final AND every collected container accounted for at the site).
 * - Destruction: the disposal record is locked FIRST (method + time), then the containers become DESTROYED, the
 *   waste DISPOSED / DISPOSED_WITH_EXCEPTION, and a PENDING certificate is created in the same transaction. The
 *   PDF is generated afterwards; a failure there never rolls back the destruction.
 * - Close without destruction (DECISION v1.2): every container MISSING / REFUSED → CLOSED_NO_DESTRUCTION, reason,
 *   alert, no certificate.
 */

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T | undefined;
const all = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows as T[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in operator, linked to the disposal site (403 otherwise). */
async function requireOperator(): Promise<ActiveUser> {
  const user = await requireRole("disposal_operator");
  if (!user.facilityId)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to the disposal site.");
  return user;
}

async function checkSite(tx: DbExecutor, user: ActiveUser): Promise<void> {
  const site = await one<{ id: string }>(
    tx,
    sql`SELECT id FROM facilities WHERE id = ${user.facilityId} AND type = 'DISPOSAL_SITE' AND status = 'ACTIVE'`
  );
  if (!site)
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to the disposal site.");
}

type LockedContainer = {
  id: string;
  container_code: string;
  status: string;
  waste_record_id: string;
  waste_code: string;
};

async function lockContainer(tx: DbExecutor, code: string): Promise<LockedContainer> {
  const c = await one<LockedContainer>(
    tx,
    sql`SELECT c.id, c.container_code, c.status, c.waste_record_id, w.waste_code
        FROM containers c JOIN waste_records w ON w.id = c.waste_record_id
        WHERE c.container_code = ${code} FOR UPDATE OF c`
  );
  if (!c) throw new AppError("UNKNOWN_CONTAINER", 404, `${code} is not a known container.`);
  if (c.status === "RECEIVED" || c.status === "MISSING" || c.status === "REFUSED") {
    throw new AppError(
      "ALREADY_RECEIVED",
      409,
      `${code} has already been checked in (${c.status}).`
    );
  }
  if (c.status !== "COLLECTED") {
    throw new AppError("NOT_COLLECTED", 409, `${code} was not collected by a truck (${c.status}).`);
  }
  return c;
}

/** The waste record's disposal record (created at its first container check-in). */
async function ensureDisposalRecord(
  tx: DbExecutor,
  wasteId: string,
  user: ActiveUser,
  requestId: string
): Promise<void> {
  const inserted = await all<{ id: string }>(
    tx,
    sql`INSERT INTO disposal_records (waste_record_id, operator_id, received_at)
        VALUES (${wasteId}, ${user.id}, now())
        ON CONFLICT (waste_record_id) DO NOTHING RETURNING id`
  );
  if (inserted[0]) {
    await writeAudit(tx, {
      actor: { userId: user.id, role: user.role },
      action: "disposal.opened",
      entityType: "disposal_record",
      entityId: inserted[0].id,
      after: { wasteRecordId: wasteId },
      requestId,
    });
  }
}

/**
 * After a container check-in: the waste becomes RECEIVED once none of its containers is still COLLECTED, and the
 * trip that carried it completes when nothing is left on board.
 */
async function settle(
  tx: DbExecutor,
  wasteId: string,
  user: ActiveUser,
  requestId: string
): Promise<{ wasteStatus: string; remaining: number; tripCompleted: boolean }> {
  const w = await one<{ status: string; remaining: number }>(
    tx,
    sql`SELECT w.status,
               (SELECT count(*) FROM containers c WHERE c.waste_record_id = w.id AND c.status = 'COLLECTED')::int AS remaining
        FROM waste_records w WHERE w.id = ${wasteId}`
  );
  let wasteStatus = w!.status;
  if (w!.status === "IN_TRANSIT" && w!.remaining === 0) {
    await transition(tx, { entity: "waste", id: wasteId, to: "RECEIVED", actor: user, requestId });
    wasteStatus = "RECEIVED";
  }
  const trip = await one<{ trip_id: string }>(
    tx,
    sql`SELECT s.trip_id FROM trip_stop_waste l JOIN trip_stops s ON s.id = l.trip_stop_id
        WHERE l.waste_record_id = ${wasteId} AND l.active
          AND s.status IN ('COLLECTED', 'COLLECTED_OVERRIDE')
        ORDER BY s.completed_at DESC LIMIT 1`
  );
  const tripCompleted = trip ? await maybeCompleteTrip(tx, trip.trip_id, user, requestId) : false;
  return { wasteStatus, remaining: w!.remaining, tripCompleted };
}

/** 5.1 A collected container arrives at the site. */
export async function receiveContainer(raw: unknown, meta: CommandMeta) {
  const user = await requireOperator();
  const parsed = receiveSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return runIdempotent(user, "POST /api/disposal/receive", meta, parsed.data, async (tx) => {
    await checkSite(tx, user);
    const c = await lockContainer(tx, parsed.data.containerCode);
    await transition(tx, {
      entity: "container",
      id: c.id,
      to: "RECEIVED",
      actor: user,
      requestId: meta.requestId,
    });
    await ensureDisposalRecord(tx, c.waste_record_id, user, meta.requestId);
    const s = await settle(tx, c.waste_record_id, user, meta.requestId);
    return { containerCode: c.container_code, status: "RECEIVED", wasteCode: c.waste_code, ...s };
  });
}

/** 5.1 A container is missing from the truck or refused at inspection (reason required). */
export async function recordContainerException(raw: unknown, meta: CommandMeta) {
  const user = await requireOperator();
  const parsed = containerExceptionSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return runIdempotent(user, "POST /api/disposal/exception", meta, parsed.data, async (tx) => {
    await checkSite(tx, user);
    const c = await lockContainer(tx, parsed.data.containerCode);
    await transition(tx, {
      entity: "container",
      id: c.id,
      to: parsed.data.kind,
      actor: user,
      reason: parsed.data.reason,
      requestId: meta.requestId,
    });
    await ensureDisposalRecord(tx, c.waste_record_id, user, meta.requestId);
    const s = await settle(tx, c.waste_record_id, user, meta.requestId);
    return {
      containerCode: c.container_code,
      status: parsed.data.kind,
      wasteCode: c.waste_code,
      ...s,
    };
  });
}

type LockedWaste = { id: string; waste_code: string; status: string };

async function lockReceivedWaste(tx: DbExecutor, wasteId: string): Promise<LockedWaste> {
  const w = await one<LockedWaste>(
    tx,
    sql`SELECT id, waste_code, status FROM waste_records WHERE id = ${wasteId} FOR UPDATE`
  );
  if (!w) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  if (w.status !== "RECEIVED") {
    throw new AppError(
      "INVALID_TRANSITION",
      409,
      `${w.waste_code} is ${w.status}: only received waste can be destroyed or closed.`
    );
  }
  return w;
}

async function containerCounts(tx: DbExecutor, wasteId: string) {
  const rows = await all<{ id: string; status: string }>(
    tx,
    sql`SELECT id, status FROM containers WHERE waste_record_id = ${wasteId} ORDER BY seq_no FOR UPDATE`
  );
  return {
    received: rows.filter((r) => r.status === "RECEIVED"),
    exceptions: rows.filter((r) => r.status === "MISSING" || r.status === "REFUSED"),
  };
}

/** 5.2 Destroy every received container of a waste record with one method. */
export async function destroyWaste(wasteId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireOperator();
  const parsed = destroySchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(wasteId)) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  const result = await runIdempotent(
    user,
    `POST /api/disposal/waste/${wasteId}/destroy`,
    meta,
    parsed.data,
    async (tx) => {
      await checkSite(tx, user);
      const w = await lockReceivedWaste(tx, wasteId);
      const method = await one<{ id: string; name: string }>(
        tx,
        sql`SELECT id, name FROM destruction_methods WHERE code = ${parsed.data.methodCode} AND active`
      );
      if (!method) {
        throw new AppError("VALIDATION_ERROR", 422, "Choose an active destruction method.", {
          fields: { methodCode: ["Unknown or inactive method"] },
        });
      }
      const { received, exceptions } = await containerCounts(tx, wasteId);
      if (received.length === 0) {
        throw new AppError(
          "NOTHING_TO_DESTROY",
          409,
          "No container of this waste was received. Close it without destruction instead."
        );
      }

      // 1. Lock the disposal record FIRST (method + time); a locked record can never change (trigger).
      const record = await one<{ id: string }>(
        tx,
        sql`UPDATE disposal_records SET method_id = ${method.id}, destroyed_at = now(), locked = true
            WHERE waste_record_id = ${wasteId} AND NOT locked RETURNING id`
      );
      if (!record)
        throw new AppError("ALREADY_DESTROYED", 409, `${w.waste_code} is already destroyed.`);
      await writeAudit(tx, {
        actor: { userId: user.id, role: user.role },
        action: "disposal.destroyed",
        entityType: "disposal_record",
        entityId: record.id,
        after: {
          wasteCode: w.waste_code,
          method: parsed.data.methodCode,
          destroyed: received.length,
          exceptions: exceptions.length,
          locked: true,
        },
        requestId: meta.requestId,
      });

      // 2. Containers and waste.
      for (const c of received) {
        await transition(tx, {
          entity: "container",
          id: c.id,
          to: "DESTROYED",
          actor: user,
          requestId: meta.requestId,
        });
      }
      const status = exceptions.length === 0 ? "DISPOSED" : "DISPOSED_WITH_EXCEPTION";
      await transition(tx, {
        entity: "waste",
        id: wasteId,
        to: status,
        actor: user,
        requestId: meta.requestId,
      });

      // 3. Certificate PENDING (generated after the commit).
      const cert = await createPendingCertificate(tx, record.id, user, meta.requestId);
      return {
        wasteCode: w.waste_code,
        status,
        destroyed: received.length,
        exceptions: exceptions.length,
        method: method.name,
        certificate: { id: cert.id, certificateNo: cert.certificateNo, status: "PENDING" },
      };
    }
  );
  generateAfterCommit(result.certificate.id);
  return result;
}

/** 5.2 Close received waste of which no container can be destroyed (all MISSING / REFUSED). No certificate. */
export async function closeWithoutDestruction(wasteId: string, raw: unknown, meta: CommandMeta) {
  const user = await requireOperator();
  const parsed = closeNoDestructionSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(wasteId)) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  return runIdempotent(
    user,
    `POST /api/disposal/waste/${wasteId}/close`,
    meta,
    parsed.data,
    async (tx) => {
      await checkSite(tx, user);
      const w = await lockReceivedWaste(tx, wasteId);
      const { received } = await containerCounts(tx, wasteId);
      if (received.length > 0) {
        throw new AppError(
          "HAS_RECEIVED_CONTAINERS",
          409,
          `${received.length} container(s) of ${w.waste_code} were received: destroy them instead.`
        );
      }
      await transition(tx, {
        entity: "waste",
        id: wasteId,
        to: "CLOSED_NO_DESTRUCTION",
        actor: user,
        reason: parsed.data.reason,
        requestId: meta.requestId,
      });
      return { wasteCode: w.waste_code, status: "CLOSED_NO_DESTRUCTION" };
    }
  );
}
