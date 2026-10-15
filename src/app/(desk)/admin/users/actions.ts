"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { updateUserAccess } from "@/server/services/facilities";
import {
  approveOnboardingRequest,
  provisionUserDirectly,
  rejectOnboardingRequest,
} from "@/server/services/onboarding";

export async function updateUserAccessAction(userId: string, input: unknown) {
  const result = await asAction("updateUserAccess", (requestId) =>
    updateUserAccess(userId, input, requestId)
  );
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function provisionUserAction(input: unknown) {
  const result = await asAction("provisionUserDirectly", (requestId) =>
    provisionUserDirectly(input, requestId)
  );
  if (result.ok) {
    revalidatePath("/admin", "layout");
    revalidatePath("/admin/users");
  }
  return result;
}

export async function approveOnboardingRequestAction(onboardingId: string) {
  const result = await asAction("approveOnboardingRequest", (requestId) =>
    approveOnboardingRequest(onboardingId, requestId)
  );
  if (result.ok) {
    revalidatePath("/admin", "layout");
    revalidatePath("/admin/users");
    revalidatePath("/pending");
  }
  return result;
}

export async function rejectOnboardingRequestAction(onboardingId: string, reason: string) {
  const result = await asAction("rejectOnboardingRequest", (requestId) =>
    rejectOnboardingRequest(onboardingId, { reason }, requestId)
  );
  if (result.ok) {
    revalidatePath("/admin", "layout");
    revalidatePath("/admin/users");
    revalidatePath("/pending");
  }
  return result;
}
