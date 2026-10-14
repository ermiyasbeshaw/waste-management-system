import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against the Neon `test` branch (.env.test.local — see tests/test-database.ts).
 * Most tests work inside a transaction that is rolled back; concurrency tests commit (on `test`, never `dev`).
 * Run with `npm run test:integration` (needs network); `npm run test` stays offline and fast.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts", "tests/permissions/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup-env.ts"],
    testTimeout: 120_000, // commits to Neon take seconds each on this network
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
