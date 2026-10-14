"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { decideDisposalRequest } from "@/server/services/medicine";

/** EFDA decision on a medicine disposal request (CLAUDE.md §12); the service allows only efda_officer. */
export async function decideRequestAction(id: string, input: unknown) {
  const r = await asAction("decideDisposalRequest", (rid) => decideDisposalRequest(id, input, rid));
  if (r.ok) revalidatePath("/regulator", "layout");
  return r;
}
