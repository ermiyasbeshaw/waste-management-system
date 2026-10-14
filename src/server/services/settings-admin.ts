import "server-only";
import { eq } from "drizzle-orm";
import {
  isSettingKey,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type SettingKey,
} from "@/lib/validation/settings";
import { writeAudit } from "@/server/audit/writer";
import { requireRole } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { inWorkflow } from "@/server/workflow/engine";

/**
 * Settings administration (CLAUDE.md §7: super_admin, audited). Kept apart from `settings.ts`, which every service
 * imports to READ settings and must stay free of the sign-in code.
 */

/**
 * Settings that cannot be changed in the app yet: Amharic labels need the client's wording and the font
 * (CLAUDE.md §6, open question), so the switch stays off until that is built.
 */
export const LOCKED_SETTINGS: readonly SettingKey[] = ["label_amharic_enabled"];

/** Every setting with its current value (super_admin). */
export async function getAllSettings(): Promise<
  { key: SettingKey; value: unknown; locked: boolean }[]
> {
  await requireRole("super_admin");
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return SETTING_KEYS.map((key) => ({
    key,
    value: byKey.get(key) ?? null,
    locked: LOCKED_SETTINGS.includes(key),
  }));
}

/**
 * Change one setting (CLAUDE.md §7: super_admin, audited). The value is validated with the key's schema; old
 * invoices keep the VAT rate and due date they were created with.
 */
export async function updateSettingValue(key: string, rawValue: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  if (!isSettingKey(key)) throw new AppError("NOT_FOUND", 404, "Unknown setting.");
  if (LOCKED_SETTINGS.includes(key)) {
    throw new AppError(
      "SETTING_LOCKED",
      409,
      "This setting cannot be changed until the feature is built."
    );
  }
  const parsed = SETTING_SCHEMAS[key].safeParse(rawValue);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", 422, "This value is not allowed for the setting.", {
      fields: { [key]: parsed.error.issues.map((i) => i.message) },
    });
  }
  return inWorkflow(async (tx) => {
    const [before] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    await tx.update(settings).set({ value: parsed.data }).where(eq(settings.key, key));
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "setting.updated",
      entityType: "setting",
      entityId: key,
      before: { value: before?.value ?? null },
      after: { value: parsed.data },
      requestId,
    });
    return { key, value: parsed.data };
  });
}
