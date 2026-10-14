"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { updateUserAccess } from "@/server/services/facilities";

export async function updateUserAccessAction(userId: string, input: unknown) {
  const result = await asAction("updateUserAccess", (requestId) =>
    updateUserAccess(userId, input, requestId)
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}
