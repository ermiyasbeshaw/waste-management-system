"use server";

import { asAction } from "@/server/api/action";
import { checkAuditChain } from "@/server/services/audit-check";

/** Runs the audit hash-chain check (read-only; EFDA officer or super_admin). */
export async function checkAuditChainAction() {
  return asAction("checkAuditChain", () => checkAuditChain());
}
