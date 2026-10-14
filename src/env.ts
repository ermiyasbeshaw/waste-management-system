import "server-only";
import { parseEnv } from "@/lib/env-schema";

/**
 * During the Next.js static build phase (e.g. `vercel build` or CI collecting static routes),
 * environment variables may not yet be injected into the build container. We provide safe
 * syntactically valid build-phase fallbacks so static route optimization (such as /_not-found)
 * can compile without crashing. At runtime, real environment variables are used.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build" ||
  (Boolean(process.env.VERCEL) && !process.env.DATABASE_URL) ||
  (Boolean(process.env.CI) && !process.env.DATABASE_URL);

const BUILD_FALLBACKS: Record<string, string> = {
  DATABASE_URL:
    "postgresql://builduser:buildpass@ep-mock-pooler.neon.tech/neondb?sslmode=require",
  DATABASE_URL_UNPOOLED:
    "postgresql://builduser:buildpass@ep-mock.neon.tech/neondb?sslmode=require",
  CLERK_SECRET_KEY: "sk_test_buildMockSecretKeyForVercelDeployment123",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    "pk_test_YnVpbGRNb2NrS2V5Rm9yVmVyY2VsRGVwbG95bWVudDEyMyQ",
  CRON_SECRET: "0123456789abcdef0123456789abcdef",
  OUTBOX_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  APP_BASE_URL: "https://safewaste.vercel.app",
};

function getRawEnv(): Record<string, string | undefined> {
  const raw = { ...process.env };
  if (isBuildPhase) {
    for (const [key, fallback] of Object.entries(BUILD_FALLBACKS)) {
      if (!raw[key] || raw[key]?.trim() === "") {
        raw[key] = fallback;
        if (!process.env[key]) {
          process.env[key] = fallback;
        }
      }
    }
  }
  return raw;
}

export const env = parseEnv(getRawEnv());

