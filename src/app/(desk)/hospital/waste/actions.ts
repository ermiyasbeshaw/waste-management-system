"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { cancelWaste } from "@/server/services/waste";

/** Cancel a registration with a reason (own facility; the service checks role, scope and the rules). */
export async function cancelWasteAction(wasteId: string, input: unknown) {
  const r = await asAction("cancelWaste", (rid) => cancelWaste(wasteId, input, rid));
  if (r.ok) revalidatePath("/hospital", "layout");
  return r;
}
