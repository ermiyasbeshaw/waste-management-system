import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "@/lib/validation/settings";
import { AppError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import { closeTestPool, drizzleOn, inRolledBackTransaction, testPool } from "./db";

afterAll(closeTestPool);

describe("getSetting (Gate 2.4)", () => {
  it("getSetting('otp_expiry_minutes') === 10 on the seeded database", async () => {
    expect(await getSetting("otp_expiry_minutes", drizzleOn(testPool()))).toBe(10);
  });

  it("all 17 seeded settings parse and equal the defaults", async () => {
    const tx = drizzleOn(testPool());
    for (const key of SETTING_KEYS) {
      expect(await getSetting(key, tx), key).toEqual(DEFAULT_SETTINGS[key]);
    }
  });

  it("reads the value inside the caller's transaction", () =>
    inRolledBackTransaction(async (c) => {
      await c.query(`UPDATE settings SET value = '12'::jsonb WHERE key = 'otp_expiry_minutes'`);
      expect(await getSetting("otp_expiry_minutes", drizzleOn(c))).toBe(12);
    }));

  it("a missing or invalid row is a SETTING_INVALID error, not a silent default", () =>
    inRolledBackTransaction(async (c) => {
      const tx = drizzleOn(c);
      await c.query(`UPDATE settings SET value = '"ten"'::jsonb WHERE key = 'otp_expiry_minutes'`);
      await c.query(`DELETE FROM settings WHERE key = 'invoice_due_days'`);
      for (const key of ["otp_expiry_minutes", "invoice_due_days"] as const) {
        const err = await getSetting(key, tx).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("SETTING_INVALID");
        expect((err as AppError).httpStatus).toBe(500);
      }
    }));
});
