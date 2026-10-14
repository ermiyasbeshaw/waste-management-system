import "server-only";
import { asc, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbExecutor } from "@/server/db/executor";
import { auditLogs } from "@/server/db/schema";
import { auditHash, type JsonValue } from "./hash";

/**
 * Walks the whole audit log in `seq` order and recomputes every hash (EFDA "hash-chain check", CLAUDE.md §3).
 * Read-only. The caller (a role-guarded query for super_admin / efda_officer) decides who may run it.
 */

export type AuditChainResult =
  | { ok: true; checked: number }
  | {
      ok: false;
      checked: number;
      brokenSeq: number;
      reason: "prev_hash_mismatch" | "hash_mismatch";
    };

export async function verifyAuditChain(
  tx: DbExecutor = db,
  batchSize = 1000
): Promise<AuditChainResult> {
  let prevHash: string | null = null;
  let lastSeq = 0;
  let checked = 0;

  for (;;) {
    const rows = await tx
      .select()
      .from(auditLogs)
      .where(gt(auditLogs.seq, lastSeq))
      .orderBy(asc(auditLogs.seq))
      .limit(batchSize);
    if (rows.length === 0) return { ok: true, checked };

    for (const r of rows) {
      if (r.prevHash !== prevHash) {
        return { ok: false, checked, brokenSeq: r.seq, reason: "prev_hash_mismatch" };
      }
      const expected = auditHash({
        prevHash: r.prevHash,
        actorUserId: r.actorUserId,
        role: r.role,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: (r.before ?? null) as JsonValue,
        after: (r.after ?? null) as JsonValue,
        ip: r.ip,
        requestId: r.requestId,
        createdAt: r.createdAt,
      });
      if (expected !== r.hash) {
        return { ok: false, checked, brokenSeq: r.seq, reason: "hash_mismatch" };
      }
      prevHash = r.hash;
      lastSeq = r.seq;
      checked += 1;
    }
  }
}
