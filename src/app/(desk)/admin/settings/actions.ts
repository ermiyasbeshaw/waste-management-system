"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { updateSettingValue } from "@/server/services/settings-admin";

/** Change one setting (super_admin; validated per key and audited by the service). */
export async function updateSettingAction(key: string, value: unknown) {
  const r = await asAction("updateSetting", (rid) => updateSettingValue(key, value, rid));
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}
