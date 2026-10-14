import "server-only";
import { desc, sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/db/executor";
import { auditLogs, type UserRoleValue } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { AUDIT_CHAIN_LOCK_KEY, auditHash, findSecretKey, toJsonValue } from "./hash";

/**
 * Audit writer (CLAUDE.md §6, DECISION v1.2 addendum). Call it with the Workflow Engine's `tx` so the audit row
 * commits together with the business change. Inserts are serialised by a transaction-level advisory lock, held
 * until the caller's transaction ends, so two writers can never read the same "last hash" and fork the chain.
 */

export { AUDIT_CHAIN_LOCK_KEY };

export interface AuditEntry {
  /** The signed-in user, or null for system jobs. */
  actor: { userId: string; role: UserRoleValue } | null;
  /** Dotted lower-case name, e.g. "waste.registered", "stop.override". */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Changed fields before / after. Never OTPs, tokens or passwords (refused). */
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  requestId?: string | null;
}

export interface WrittenAudit {
  id: string;
  seq: number;
  hash: string;
}

export async function writeAudit(tx: DbExecutor, entry: AuditEntry): Promise<WrittenAudit> {
  const before = toJsonValue(entry.before);
  const after = toJsonValue(entry.after);
  const secret = findSecretKey(before) ?? findSecretKey(after);
  if (secret) {
    throw new AppError("AUDIT_SECRET_FIELD", 500, "Audit entries must not contain secrets", {
      field: secret,
    });
  }

  // Savepoint inside the caller's transaction (or a transaction of its own when called with `db`).
  return tx.transaction(async (t) => {
    await t.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);
    const [last] = await t
      .select({ hash: auditLogs.hash })
      .from(auditLogs)
      .orderBy(desc(auditLogs.seq))
      .limit(1);

    const row = {
      prevHash: last?.hash ?? null,
      actorUserId: entry.actor?.userId ?? null,
      role: entry.actor?.role ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before,
      after,
      ip: entry.ip ?? null,
      requestId: entry.requestId ?? null,
      createdAt: new Date(),
    };
    const hash = auditHash(row);

    const [written] = await t
      .insert(auditLogs)
      .values({
        ...row,
        // SQL NULL rather than jsonb 'null' when there is nothing to record (both read back as null).
        before: before ?? sql`NULL`,
        after: after ?? sql`NULL`,
        hash,
      })
      .returning({ id: auditLogs.id, seq: auditLogs.seq, hash: auditLogs.hash });
    return written;
  });
}
