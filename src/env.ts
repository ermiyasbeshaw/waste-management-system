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
    "postgresql://neondb_owner:npg_m7TVjH2xQqgz@ep-soft-bar-b1md10na-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  DATABASE_URL_UNPOOLED:
    "postgresql://neondb_owner:npg_m7TVjH2xQqgz@ep-soft-bar-b1md10na.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  CLERK_SECRET_KEY: "sk_test_Ax1w1p6FCqT45QhwPxJA6X1eh4hsHpZac8rSLR6aRp",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    "pk_test_YWNlLW1hbGFtdXRlLTgyMDIuY2xlcmsuYWNjb3VudHMuZGV2JA",
  CRON_SECRET: "dd763e4f30a948e350be06c9495386c158ac8b8caf831f8ba475caf95053e217",
  OUTBOX_ENCRYPTION_KEY:
    "82b597e7c1eac286c86d2553d42524c23ab546e1db7f11de60ce7699f10b10c7",
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

