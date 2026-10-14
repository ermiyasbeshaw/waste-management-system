import "server-only";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { writeAudit } from "@/server/audit/writer";
import { env } from "@/env";
import { withTransaction } from "@/server/db/client";
import type { DbExecutor } from "@/server/db/executor";
import {
  certificates,
  containers,
  contracts,
  drivers,
  facilities,
  handovers,
  invoices,
  medicineDisposalRequests,
  otpCodes,
  tripStops,
  trips,
  vehicles,
  wasteRecords,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import { runThenKick } from "@/server/outbox/after-commit";
import { dispatchPending } from "@/server/outbox/dispatcher";
import { runGuards, type Guard } from "./guards";
import {
  checkTransition,
  EFDA_WRITABLE_ENTITIES,
  type Actor,
  type Entity,
  type StatusOf,
} from "./table";

/**
 * Workflow Engine (CLAUDE.md §5, §8): the ONLY way a status changes. `transition()` runs inside the caller's
 * transaction: lock the row (FOR UPDATE) → check the move in the transition table (409 INVALID_TRANSITION),
 * role (403), reason (422), facility scope → run the guards → update status + fields → write the audit row.
 * Side effects (outbox messages, related rows) are the calling service's job, in the same transaction.
 */

const TABLES: Record<Entity, PgTable> = {
  waste: wasteRecords,
  container: containers,
  handover: handovers,
  trip: trips,
  stop: tripStops,
  otp: otpCodes,
  certificate: certificates,
  invoice: invoices,
  contract: contracts,
  facility: facilities,
  vehicle: vehicles,
  driver: drivers,
  medicine_request: medicineDisposalRequests,
};

/** Entity name in the audit log (matches the table's meaning, not the TypeScript key). */
const AUDIT_ENTITY: Record<Entity, string> = {
  waste: "waste_record",
  container: "container",
  handover: "handover",
  trip: "trip",
  stop: "trip_stop",
  otp: "otp_code",
  certificate: "certificate",
  invoice: "invoice",
  contract: "contract",
  facility: "facility",
  vehicle: "vehicle",
  driver: "driver",
  medicine_request: "medicine_request",
};

export interface TransitionInput<E extends Entity> {
  entity: E;
  id: string;
  to: StatusOf<E>;
  actor: Actor;
  reason?: string | null;
  /** Other columns to set in the same UPDATE (camelCase names), e.g. `{ completedAt: now }`. */
  set?: Record<string, unknown>;
  guards?: readonly Guard<E>[];
  /** Audit action; default `<entity>.<to>` in lower case, e.g. "stop.skipped". */
  action?: string;
  requestId?: string | null;
  ip?: string | null;
}

export interface TransitionResult<E extends Entity> {
  from: StatusOf<E>;
  to: StatusOf<E>;
  /** The updated row (snake_case column names). */
  row: Record<string, unknown>;
}

function setClause(table: PgTable, values: Record<string, unknown>): SQL {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const parts = Object.entries(values).map(([key, value]) => {
    const column = columns[key];
    if (!column) throw new Error(`Workflow: unknown column "${key}" on ${String(table)}`);
    return sql`${sql.identifier(column.name)} = ${value}`;
  });
  return sql.join(parts, sql`, `);
}

/** For the audit log: Dates as ISO strings, everything else as given. */
function auditable(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
  );
}

export async function transition<E extends Entity>(
  tx: DbExecutor,
  input: TransitionInput<E>
): Promise<TransitionResult<E>> {
  const { entity, id, to, actor } = input;
  const table = TABLES[entity];
  const reason = input.reason?.trim() || null;
  const extra = { ...(input.set ?? {}) };
  if ("status" in extra) throw new Error("Workflow: pass the new status as `to`, not in `set`");

  // efda_officer is refused before any row is read or locked (except medicine requests, CLAUDE.md §12).
  if (actor?.role === "efda_officer" && !EFDA_WRITABLE_ENTITIES.includes(entity)) {
    checkTransition({ entity, from: to, to, actor });
  }

  const locked = await tx.execute(
    sql`SELECT * FROM ${table} WHERE ${sql.identifier("id")} = ${id} FOR UPDATE`
  );
  const row = locked.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new AppError("NOT_FOUND", 404, `${entity} not found.`, { entity });

  const from = row.status as StatusOf<E>;
  const rule = checkTransition({
    entity,
    from,
    to,
    actor,
    reason,
    recordFacilityId: "facility_id" in row ? (row.facility_id as string | null) : undefined,
  });

  await runGuards(input.guards ?? [], { tx, entity, id, row, from, to, actor, reason });

  const now = new Date();
  if (rule.reason?.column) extra[rule.reason.column] = reason;
  if (rule.reason?.at) extra[rule.reason.at] = now;

  const updated = await tx.execute(
    sql`UPDATE ${table} SET ${setClause(table, { status: to, ...extra })}
        WHERE ${sql.identifier("id")} = ${id} AND ${sql.identifier("status")} = ${from}
        RETURNING *`
  );
  if (updated.rows.length !== 1) {
    // Cannot happen while the row is locked; refuse rather than write a misleading audit row.
    throw new AppError("CONFLICT", 409, `${entity} changed while it was being updated.`);
  }

  await writeAudit(tx, {
    actor: actor ? { userId: actor.id, role: actor.role } : null,
    action: input.action ?? `${entity}.${to.toLowerCase()}`,
    entityType: AUDIT_ENTITY[entity],
    entityId: id,
    before: { status: from },
    after: { status: to, ...(reason ? { reason } : {}), ...auditable(input.set ?? {}) },
    requestId: input.requestId ?? null,
    ip: input.ip ?? null,
  });

  return { from, to, row: updated.rows[0] as Record<string, unknown> };
}

/**
 * Runs a workflow command in one database transaction (status changes + audit + outbox commit together).
 * If the command enqueued messages, the dispatcher is started right after the commit (best effort; the
 * every-minute job `POST /api/jobs/outbox` sends anything left).
 */
export function inWorkflow<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return runThenKick(
    () => withTransaction(fn),
    () =>
      env.OUTBOX_DISPATCH_AFTER_COMMIT === "0" ? Promise.resolve() : dispatchPending({ limit: 20 }),
    (e) => log.warn("Outbox dispatch after commit failed; the job will retry", { error: String(e) })
  );
}
