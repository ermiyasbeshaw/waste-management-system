"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { createFacility, setFacilityStatus, updateFacility } from "@/server/services/facilities";

export async function createFacilityAction(input: unknown) {
  const result = await asAction("createFacility", (requestId) => createFacility(input, requestId));
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function updateFacilityAction(code: string, input: unknown) {
  const result = await asAction("updateFacility", (requestId) =>
    updateFacility(code, input, requestId)
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function setFacilityStatusAction(code: string, input: unknown) {
  const result = await asAction("setFacilityStatus", (requestId) =>
    setFacilityStatus(code, input, requestId)
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}
