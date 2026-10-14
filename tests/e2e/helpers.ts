import { createHmac } from "node:crypto";
import { config } from "dotenv";
import { type Page } from "@playwright/test";
import { Pool } from "@neondatabase/serverless";
import { testDatabaseEnv } from "../test-database";

/** Shared e2e helpers: test logins and direct access to the Neon `test` branch the e2e server uses. */

// The test server (next dev) signs /dev-login cookies with DEV_LOGIN_SECRET from .env.development.local.
config({ path: ".env.development.local", quiet: true });
const DEV_LOGIN_SECRET = process.env.DEV_LOGIN_SECRET ?? "";

export type DevRole =
  | "super_admin"
  | "hospital_admin"
  | "hospital_staff"
  | "driver"
  | "disposal_operator"
  | "efda_officer";

export const USERNAME_BY_ROLE: Record<DevRole, string> = {
  super_admin: "sw_admin",
  hospital_admin: "sw_hospital_admin",
  hospital_staff: "sw_hospital_staff",
  driver: "sw_driver",
  disposal_operator: "sw_disposal",
  efda_officer: "sw_efda",
};

/** A certificate token of the given status from the test database (the e2e server uses the same branch). */
export async function certificateToken(
  status: "ISSUED" | "REVOKED" | "PENDING" | "FAILED"
): Promise<string> {
  const pool = new Pool({ connectionString: testDatabaseEnv().DATABASE_URL_UNPOOLED });
  try {
    const { rows } = await pool.query(
      `SELECT verify_token FROM certificates WHERE status = $1 ORDER BY certificate_no LIMIT 1`,
      [status]
    );
    if (!rows[0]) throw new Error(`No ${status} certificate in the test database (run the seed)`);
    return rows[0].verify_token as string;
  } finally {
    await pool.end();
  }
}

/**
 * Signs in as a dashboard test login without typing the password: a session cookie signed exactly like
 * src/server/auth/dev-session.ts. The server verifies it and loads the seeded user `dev_<role>`.
 */
export async function asRole(page: Page, role: DevRole) {
  const payload = Buffer.from(
    JSON.stringify({
      username: USERNAME_BY_ROLE[role],
      role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const signature = createHmac("sha256", DEV_LOGIN_SECRET).update(payload).digest("base64url");
  await page
    .context()
    .addCookies([
      { name: "sw_dev_session", value: `${payload}.${signature}`, url: "http://localhost:3100" },
    ]);
}

/**
 * Signs in as a throw-away e2e user (`clerk_user_id` = `e2e_…`), accepted only by the Playwright test server
 * (DEV_AUTH_BYPASS=1). Lets e2e tests build their own users and never touch the seeded demo users.
 */
export async function asIdentity(page: Page, clerkUserId: string, role: DevRole) {
  const payload = Buffer.from(
    JSON.stringify({ username: clerkUserId, role, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  const signature = createHmac("sha256", DEV_LOGIN_SECRET).update(payload).digest("base64url");
  await page
    .context()
    .addCookies([
      { name: "sw_dev_session", value: `${payload}.${signature}`, url: "http://localhost:3100" },
    ]);
}

/** Runs a query on the test database (the e2e server uses the same branch). */
export async function testDb<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = new Pool({
    connectionString: testDatabaseEnv().DATABASE_URL_UNPOOLED,
    connectionTimeoutMillis: 15_000,
  });
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}
