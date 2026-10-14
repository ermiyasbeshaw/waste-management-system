import { z } from "zod";

/**
 * Environment rules (CLAUDE.md §9: env vars validated at startup). Pure module so it can be unit-tested;
 * `src/env.ts` applies it to `process.env` on the server. Secrets have no defaults and placeholders are refused.
 * Error messages name variables only — never their values.
 */

const PLACEHOLDER = /placeholder|changeme|your[_-]?key|xxx/i;

const secret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .trim()
    .min(1, `${name} is required`)
    .refine((v) => !PLACEHOLDER.test(v), `${name} still has a placeholder value`);

const postgresUrl = (name: string) =>
  secret(name).refine(
    (v) => /^postgres(ql)?:\/\/[^\s]+$/.test(v),
    `${name} must be a postgres:// or postgresql:// connection string`
  );

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Neon PostgreSQL: pooled URL for the app, direct (unpooled) URL for migrations.
    DATABASE_URL: postgresUrl("DATABASE_URL"),
    DATABASE_URL_UNPOOLED: postgresUrl("DATABASE_URL_UNPOOLED"),

    // Clerk (identity only).
    CLERK_SECRET_KEY: secret("CLERK_SECRET_KEY").refine(
      (v) => /^sk_(test|live)_[A-Za-z0-9]+$/.test(v),
      "CLERK_SECRET_KEY must look like sk_test_… or sk_live_…"
    ),
    /** Optional until the Clerk webhook is set up (Gate 1b.8). */
    CLERK_WEBHOOK_SECRET: z
      .string()
      .trim()
      .regex(/^whsec_[A-Za-z0-9+/=]+$/, "CLERK_WEBHOOK_SECRET must look like whsec_…")
      .optional(),

    // Scheduled jobs (POST /api/jobs/*) authenticate with this bearer secret.
    CRON_SECRET: secret("CRON_SECRET").refine(
      (v) => v.length >= 32,
      "CRON_SECRET must be at least 32 characters"
    ),

    // Encrypts secrets (pickup OTP codes) while they wait in the outbox; 32 random bytes as 64 hex characters.
    OUTBOX_ENCRYPTION_KEY: secret("OUTBOX_ENCRYPTION_KEY").refine(
      (v) => /^[0-9a-f]{64}$/i.test(v),
      "OUTBOX_ENCRYPTION_KEY must be 64 hex characters (32 random bytes)"
    ),

    /**
     * "0" = do not start the outbox dispatcher right after a commit (messages wait for POST /api/jobs/outbox).
     * Development / tests only (lets tests read a pickup code before it is sent and wiped); refused in production.
     */
    OUTBOX_DISPATCH_AFTER_COMMIT: z.enum(["0", "1"]).optional(),

    /** Development-only sign-in bypass for automated tests (src/server/auth/dev-bypass.ts). */
    DEV_AUTH_BYPASS: z.enum(["0", "1", "always"]).optional(),
    /** Signs the development test-login cookie (/dev-login). Only used while the dev bypass is active. */
    DEV_LOGIN_SECRET: z
      .string()
      .trim()
      .min(32, "DEV_LOGIN_SECRET must be at least 32 characters")
      .optional(),

    /**
     * Folder for stored files (certificate PDFs) used by the development storage adapter. The production storage
     * provider is chosen with the hosting (Gate 7.4); until then files live on the server's disk.
     */
    STORAGE_DIR: z.string().trim().min(1).optional(),

    /** Base URL for links in emails and verification QR codes. */
    APP_BASE_URL: z.string().trim().url("APP_BASE_URL must be a full URL").optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_AUTH_BYPASS && env.DEV_AUTH_BYPASS !== "0") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEV_AUTH_BYPASS"],
        message: "DEV_AUTH_BYPASS must not be enabled in production",
      });
    }
    if (env.NODE_ENV === "production" && env.OUTBOX_DISPATCH_AFTER_COMMIT === "0") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OUTBOX_DISPATCH_AFTER_COMMIT"],
        message: "OUTBOX_DISPATCH_AFTER_COMMIT=0 is for development and tests only",
      });
    }
    if (env.NODE_ENV === "production" && !env.APP_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL is required in production",
      });
    }
  })
  .transform((env) => ({
    ...env,
    APP_BASE_URL: env.APP_BASE_URL ?? "http://localhost:3000",
    STORAGE_DIR: env.STORAGE_DIR ?? ".storage",
  }));

/** Public values (inlined into the browser bundle by Next.js). Never put secrets here. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: secret("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY").refine(
    (v) => /^pk_(test|live)_[A-Za-z0-9$_-]+$/.test(v),
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must look like pk_test_… or pk_live_…"
  ),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().trim().startsWith("/").default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().trim().startsWith("/").default("/sign-up"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().trim().startsWith("/").default("/"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().trim().startsWith("/").default("/"),
  NEXT_PUBLIC_MAP_TILE_URL: z
    .string()
    .trim()
    .default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  NEXT_PUBLIC_MAP_ATTRIBUTION: z
    .string()
    .trim()
    .default(
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    ),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;
export type PublicEnv = z.output<typeof publicEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `Invalid environment configuration (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nSee .env.example for every variable. Values are never printed."
    );
    this.name = "EnvError";
  }
}

/** Validates a raw env object. Throws `EnvError` listing every problem (names only, no values). */
export function parseEnv(raw: Record<string, string | undefined>): ServerEnv & PublicEnv {
  // Treat empty strings as "not set" so `KEY=` in a .env file counts as missing.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v.trim() !== "")
  );
  const server = serverEnvSchema.safeParse(cleaned);
  const pub = publicEnvSchema.safeParse(cleaned);
  const problems = [
    ...(server.success ? [] : server.error.issues.map((i) => i.message)),
    ...(pub.success ? [] : pub.error.issues.map((i) => i.message)),
  ];
  if (!server.success || !pub.success) throw new EnvError(problems);
  return { ...server.data, ...pub.data };
}
