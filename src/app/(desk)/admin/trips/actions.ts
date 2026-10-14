"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { createTrip } from "@/server/services/scheduling";

/** Plan a trip from the waiting list (super_admin; the service re-checks every guard). */
export async function createTripAction(input: unknown) {
  const result = await asAction("createTrip", (requestId) => createTrip(input, requestId));
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}
