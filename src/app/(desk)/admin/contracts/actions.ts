"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { createContract, updateContract } from "@/server/services/billing";

/** Contract actions (super_admin only; the service re-checks the role). */

export async function createContractAction(input: unknown) {
  const r = await asAction("createContract", (rid) => createContract(input, rid));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function updateContractAction(id: string, input: unknown) {
  const r = await asAction("updateContract", (rid) => updateContract(id, input, rid));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}
