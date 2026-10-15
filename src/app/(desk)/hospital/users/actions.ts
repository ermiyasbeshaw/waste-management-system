"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { updateHospitalUser } from "@/server/services/facilities";
import {
  approveOnboardingRequest,
  rejectOnboardingRequest,
} from "@/server/services/onboarding";

export async function updateHospitalUserAction(userId: string, input: unknown) {
  const result = await asAction("updateHospitalUser", (requestId) =>
    updateHospitalUser(userId, input, requestId)
  );
  if (result.ok) revalidatePath("/hospital", "layout");
  return result;
}

export async function approveHospitalStaffRequestAction(onboardingId: string) {
  const result = await asAction("approveOnboardingRequest", (requestId) =>
    approveOnboardingRequest(onboardingId, requestId)
  );
  if (result.ok) {
    revalidatePath("/hospital", "layout");
    revalidatePath("/hospital/users");
    revalidatePath("/pending");
  }
  return result;
}

export async function rejectHospitalStaffRequestAction(onboardingId: string, reason: string) {
  const result = await asAction("rejectOnboardingRequest", (requestId) =>
    rejectOnboardingRequest(onboardingId, { reason }, requestId)
  );
  if (result.ok) {
    revalidatePath("/hospital", "layout");
    revalidatePath("/hospital/users");
    revalidatePath("/pending");
  }
  return result;
}
