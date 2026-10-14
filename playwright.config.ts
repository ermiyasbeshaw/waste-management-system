import { defineConfig, devices } from "@playwright/test";
import { testDatabaseEnv } from "./tests/test-database";

const PORT = 3100;

/**
 * End-to-end tests against `next dev`. The test server starts with DEV_AUTH_BYPASS=1 and every request carries
 * `x-dev-auth-bypass: 1`, so tests do not sign in through Clerk (an external identity provider); the role comes
 * from a signed dev-session cookie (tests/e2e/routes.spec.ts → asRole). The server uses the Neon `test` branch
 * (environment variables win over .env files in Next.js), so e2e writes never touch the demo data on `dev`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Dev-only sign-in bypass (src/server/auth/dev-bypass.ts); tests that need a signed-out visitor remove it.
    extraHTTPHeaders: { "x-dev-auth-bypass": "1" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 180_000,
    // A server you started yourself would not have the bypass flag, so always start a fresh one.
    reuseExistingServer: false,
    // Messages wait for the outbox job, so e2e can read a pickup code from the test database before it is sent.
    env: { DEV_AUTH_BYPASS: "1", OUTBOX_DISPATCH_AFTER_COMMIT: "0", ...testDatabaseEnv() },
  },
});
