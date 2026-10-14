"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { updateHospitalUser } from "@/server/services/facilities";

export async function updateHospitalUserAction(userId: string, input: unknown) {
  const result = await asAction("updateHospitalUser", (requestId) =>
    updateHospitalUser(userId, input, requestId)
  );
  if (result.ok) revalidatePath("/hospital", "layout");
  return result;
}
