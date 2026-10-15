"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { getAuthUserId } from "@/server/auth/current-user";
import { submitOnboardingRequest } from "@/server/services/onboarding";

export async function submitOnboardingRequestAction(input: unknown) {
  const clerkUserId = await getAuthUserId();
  if (!clerkUserId) {
    return { ok: false as const, message: "You must be signed in to submit an onboarding request." };
  }
  const result = await asAction("submitOnboardingRequest", (requestId) =>
    submitOnboardingRequest(input, clerkUserId, requestId)
  );
  if (result.ok) {
    revalidatePath("/pending");
    revalidatePath("/admin/users");
    revalidatePath("/hospital/users");
  }
  return result;
}
