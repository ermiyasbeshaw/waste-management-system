import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/lib/env-schema";

// Fake, well-formed values (not real credentials).
const VALID = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pw@ep-test-pooler.example.neon.tech/db?sslmode=require",
  DATABASE_URL_UNPOOLED: "postgresql://user:pw@ep-test.example.neon.tech/db?sslmode=require",
  CLERK_SECRET_KEY: "sk_test_abcdefghijklmnopqrstuvwxyz0123456789",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
  CRON_SECRET: "0123456789abcdef0123456789abcdef",
  OUTBOX_ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
};

function problemsOf(raw: Record<string, string | undefined>): string[] {
  try {
    parseEnv(raw);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(EnvError);
    return (e as EnvError).problems;
  }
}

describe("parseEnv", () => {
  it("accepts a complete configuration and fills non-secret defaults", () => {
    const env = parseEnv(VALID);
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL).toBe("/sign-in");
    expect(env.NEXT_PUBLIC_CLERK_SIGN_UP_URL).toBe("/sign-up");
    expect(env.CLERK_WEBHOOK_SECRET).toBeUndefined();
  });

  it("has no defaults for secrets: each missing secret is reported", () => {
    const problems = problemsOf({ NODE_ENV: "development" });
    for (const name of [
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "CLERK_SECRET_KEY",
      "CRON_SECRET",
      "OUTBOX_ENCRYPTION_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ]) {
      expect(problems.some((p) => p.startsWith(name))).toBe(true);
    }
  });

  it("treats an empty value as missing", () => {
    expect(problemsOf({ ...VALID, DATABASE_URL: "  " })).toContain("DATABASE_URL is required");
  });

  it("refuses the old placeholder keys from the prototype", () => {
    const problems = problemsOf({
      ...VALID,
      CLERK_SECRET_KEY: "sk_test_placeholder_key",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder_key",
    });
    expect(problems).toContain("CLERK_SECRET_KEY still has a placeholder value");
    expect(problems).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY still has a placeholder value");
  });

  it("checks formats: postgres URL, Clerk key prefixes, CRON_SECRET length, webhook secret", () => {
    const problems = problemsOf({
      ...VALID,
      DATABASE_URL: "mysql://x",
      CLERK_SECRET_KEY: "abc",
      CRON_SECRET: "short",
      CLERK_WEBHOOK_SECRET: "nope",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "DATABASE_URL must be a postgres:// or postgresql:// connection string",
        "CLERK_SECRET_KEY must look like sk_test_… or sk_live_…",
        "CRON_SECRET must be at least 32 characters",
        "CLERK_WEBHOOK_SECRET must look like whsec_…",
      ])
    );
  });

  it("requires APP_BASE_URL in production", () => {
    expect(problemsOf({ ...VALID, NODE_ENV: "production" })).toContain(
      "APP_BASE_URL is required in production"
    );
    expect(
      problemsOf({ ...VALID, NODE_ENV: "production", APP_BASE_URL: "https://safewaste.example" })
    ).toEqual([]);
  });

  it("refuses the dev sign-in bypass in production", () => {
    expect(
      problemsOf({
        ...VALID,
        NODE_ENV: "production",
        APP_BASE_URL: "https://x.example",
        DEV_AUTH_BYPASS: "1",
      })
    ).toContain("DEV_AUTH_BYPASS must not be enabled in production");
    expect(
      problemsOf({
        ...VALID,
        NODE_ENV: "production",
        APP_BASE_URL: "https://x.example",
        DEV_AUTH_BYPASS: "always",
      })
    ).toContain("DEV_AUTH_BYPASS must not be enabled in production");
    expect(problemsOf({ ...VALID, DEV_AUTH_BYPASS: "1" })).toEqual([]);
    expect(problemsOf({ ...VALID, DEV_AUTH_BYPASS: "always" })).toEqual([]);
  });

  it("never puts a value into the error message", () => {
    const secretValue = "postgresql://user:SUPER-SECRET@host/db";
    try {
      parseEnv({ ...VALID, CRON_SECRET: "x", DATABASE_URL_UNPOOLED: secretValue + " with space" });
    } catch (e) {
      expect((e as Error).message).not.toContain("SUPER-SECRET");
      return;
    }
    throw new Error("expected parseEnv to throw");
  });
});

describe("OUTBOX_DISPATCH_AFTER_COMMIT", () => {
  const VALID_PROD = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pw@ep-test-pooler.example.neon.tech/db",
    DATABASE_URL_UNPOOLED: "postgresql://user:pw@ep-test.example.neon.tech/db",
    CLERK_SECRET_KEY: "sk_test_abcdefghijklmnopqrstuvwxyz0123456789",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
    CRON_SECRET: "0123456789abcdef0123456789abcdef",
    OUTBOX_ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    APP_BASE_URL: "https://safewaste.example.com",
  };
  it("is refused in production (tests only)", () => {
    expect(() => parseEnv({ ...VALID_PROD, OUTBOX_DISPATCH_AFTER_COMMIT: "0" })).toThrow(EnvError);
    expect(parseEnv(VALID_PROD).OUTBOX_DISPATCH_AFTER_COMMIT).toBeUndefined();
  });
});
