import "server-only";
import { eq } from "drizzle-orm";
import { parseSetting, type SettingKey, type SettingValue } from "@/lib/validation/settings";
import { db } from "@/server/db/client";
import type { DbExecutor } from "@/server/db/executor";
import { settings } from "@/server/db/schema";
import { AppError } from "@/server/errors";

/**
 * Reads one setting (CLAUDE.md §7), typed per key: `getSetting("otp_expiry_minutes")` is a number.
 * Internal helper for services and jobs (no role check: it exposes nothing to a user by itself). Pass `tx` to read
 * inside a Workflow Engine transaction. A missing or invalid row is a configuration error (500) — there is no
 * silent fallback to a hard-coded value. Editing settings (super_admin, audited) is a separate service.
 */
export async function getSetting<K extends SettingKey>(
  key: K,
  tx: DbExecutor = db
): Promise<SettingValue<K>> {
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (!row) {
    throw new AppError("SETTING_INVALID", 500, `Setting ${key} is missing`, { key });
  }
  const parsed = parseSetting(key, row.value);
  if (!parsed.success) {
    throw new AppError("SETTING_INVALID", 500, `Setting ${key} has an invalid value`, { key });
  }
  return parsed.data;
}
