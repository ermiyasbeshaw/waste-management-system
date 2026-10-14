import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

/**
 * Tests write to a database (concurrency tests, audit rows, e2e registrations), so they run on the Neon branch
 * `test` (forked from `dev`, 9 Oct 2026) — never on `dev`, which holds the demo data. The URLs are in
 * `.env.test.local` (git-ignored). This refuses to start when the file is missing or points at the dev endpoint.
 */
const endpoint = (url: string | undefined) =>
  url?.match(/@(ep-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+)/)?.[1] ?? null;

export function testDatabaseEnv(): { DATABASE_URL: string; DATABASE_URL_UNPOOLED: string } {
  if (!existsSync(".env.test.local")) {
    throw new Error(
      ".env.test.local is missing: tests need the Neon `test` branch (DATABASE_URL, DATABASE_URL_UNPOOLED)."
    );
  }
  const test = parse(readFileSync(".env.test.local"));
  const dev = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const { DATABASE_URL, DATABASE_URL_UNPOOLED } = test;
  if (!DATABASE_URL || !DATABASE_URL_UNPOOLED) {
    throw new Error(".env.test.local must set DATABASE_URL and DATABASE_URL_UNPOOLED.");
  }
  const testEndpoint = endpoint(DATABASE_URL_UNPOOLED);
  if (!testEndpoint || testEndpoint !== endpoint(DATABASE_URL)) {
    throw new Error(".env.test.local: both URLs must point at the same Neon endpoint.");
  }
  if (testEndpoint === endpoint(dev.DATABASE_URL_UNPOOLED)) {
    throw new Error(
      ".env.test.local points at the dev branch — refusing to run tests on the demo data."
    );
  }
  return { DATABASE_URL, DATABASE_URL_UNPOOLED };
}
