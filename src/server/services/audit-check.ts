import "server-only";
import { requireRole } from "@/server/auth/current-user";
import { withTransaction } from "@/server/db/client";
import { verifyAuditChain, type AuditChainResult } from "@/server/audit/verify";

/**
 * Hash-chain check of the audit log (Gate 6.5, CLAUDE.md §3: the EFDA officer verifies the ledger; read-only).
 * Recomputes every hash in seq order and reports the first broken entry, if any.
 */
export async function checkAuditChain(): Promise<AuditChainResult> {
  await requireRole("efda_officer", "super_admin");
  return withTransaction((tx) => verifyAuditChain(tx));
}
