import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isSettingKey,
  parseSetting,
} from "@/lib/validation/settings";

describe("settings schemas (CLAUDE.md §7)", () => {
  it("has exactly the 18 keys of CLAUDE.md §7 (incl. expiry_alert_days, §12) with their documented defaults", () => {
    expect(SETTING_KEYS).toHaveLength(18);
    expect(DEFAULT_SETTINGS).toMatchObject({
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
    });
  });

  it("every default passes its own schema", () => {
    for (const key of SETTING_KEYS) {
      expect(parseSetting(key, DEFAULT_SETTINGS[key]), key).toEqual({
        success: true,
        data: DEFAULT_SETTINGS[key],
      });
    }
  });

  it("rejects values of the wrong type or out of range", () => {
    expect(parseSetting("otp_expiry_minutes", "10").success).toBe(false);
    expect(parseSetting("otp_expiry_minutes", 0).success).toBe(false);
    expect(parseSetting("otp_max_attempts", 2.5).success).toBe(false);
    expect(parseSetting("vat_rate_percent", 101).success).toBe(false);
    expect(parseSetting("label_amharic_enabled", "true").success).toBe(false);
    expect(parseSetting("system_name", "   ").success).toBe(false);
    expect(parseSetting("otp_resend_cooldown_seconds", 0).success).toBe(true);
  });

  it("knows which keys exist", () => {
    expect(isSettingKey("otp_expiry_minutes")).toBe(true);
    expect(isSettingKey("finance_officer_email")).toBe(false);
    expect(isSettingKey("toString")).toBe(false);
  });
});
