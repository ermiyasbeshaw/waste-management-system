import { z } from "zod";

/**
 * System settings (CLAUDE.md §7): one zod schema and one default per key. The defaults are what `npm run db:seed`
 * writes; at runtime the value always comes from the `settings` table via `getSetting(key)` — business code never
 * hard-codes these numbers. Ranges are sanity limits only (ASSUMPTION, not business rules).
 */

const minutes = z
  .number()
  .int()
  .min(1)
  .max(24 * 60);
const days = z.number().int().min(1).max(365);
const count = (max: number) => z.number().int().min(1).max(max);

export const SETTING_SCHEMAS = {
  otp_expiry_minutes: minutes,
  otp_max_attempts: count(20),
  otp_resend_cooldown_seconds: z.number().int().min(0).max(3600),
  otp_max_per_stop: count(20),
  geofence_radius_m: z.number().int().min(10).max(10_000),
  tracker_silent_minutes: minutes,
  tracker_max_clock_skew_minutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  max_trip_stops: count(50),
  overdue_pickup_days: days,
  contract_expiry_warning_days: days,
  license_expiry_warning_days: days,
  vat_rate_percent: z.number().min(0).max(100),
  outbox_max_attempts: count(20),
  label_amharic_enabled: z.boolean(),
  invoice_due_days: days,
  system_name: z.string().trim().min(1).max(120),
  region_focus: z.string().trim().min(1).max(120),
  /** Days before a medicine's expiry date when an alert is raised (CLAUDE.md §12); the expiry day always alerts. */
  expiry_alert_days: z
    .array(z.number().int().min(1).max(365))
    .min(1)
    .max(10)
    .refine((a) => new Set(a).size === a.length, "Each number only once"),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
export type Settings = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

export const DEFAULT_SETTINGS: Settings = {
  otp_expiry_minutes: 10,
  otp_max_attempts: 5,
  otp_resend_cooldown_seconds: 60,
  otp_max_per_stop: 3,
  geofence_radius_m: 300,
  tracker_silent_minutes: 15,
  tracker_max_clock_skew_minutes: 5,
  max_trip_stops: 6,
  overdue_pickup_days: 7,
  contract_expiry_warning_days: 30,
  license_expiry_warning_days: 30,
  vat_rate_percent: 15,
  outbox_max_attempts: 6,
  label_amharic_enabled: false,
  invoice_due_days: 30,
  system_name: "SafeWaste Biohazard Tracking Network",
  region_focus: "Dire Dawa Administration",
  expiry_alert_days: [90, 30, 7],
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, key);
}

/** Validates a stored (jsonb) value for `key`; `success: false` when it does not fit the schema. */
export function parseSetting<K extends SettingKey>(
  key: K,
  raw: unknown
): { success: true; data: SettingValue<K> } | { success: false } {
  const result = SETTING_SCHEMAS[key].safeParse(raw);
  return result.success
    ? { success: true, data: result.data as SettingValue<K> }
    : { success: false };
}
