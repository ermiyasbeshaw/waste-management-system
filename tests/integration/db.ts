import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { DbExecutor } from "@/server/db/executor";
import * as schema from "@/server/db/schema";

/** Test helpers: each test gets a client inside BEGIN … ROLLBACK, so nothing persists. */

let pool: Pool | undefined;

export function testPool(): Pool {
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    // Also the wait for a free pooled client: the 50-parallel-transaction tests queue for minutes on a slow link.
    connectionTimeoutMillis: 120_000,
    max: 20,
  });
  return pool;
}

export async function closeTestPool() {
  await pool?.end();
  pool = undefined;
}

/** A Drizzle executor on one client (e.g. inside `inRolledBackTransaction`), like the app's `tx`. */
export function drizzleOn(c: PoolClient | Pool): DbExecutor {
  return drizzle(c, { schema, casing: "snake_case" });
}

/** Runs `fn` in its own transaction that COMMITS (for concurrency tests); clean up afterwards. */
export async function inCommittedTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return drizzleOn(testPool()).transaction(fn);
}

class Rollback extends Error {}

/**
 * Like `inRolledBackTransaction`, but hands out a Drizzle transaction, so code that opens its own nested
 * transaction (e.g. `writeAudit`) gets a SAVEPOINT instead of committing the test's transaction.
 */
export async function inRolledBackDrizzle(fn: (tx: DbExecutor) => Promise<void>): Promise<void> {
  await drizzleOn(testPool())
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

export async function inRolledBackTransaction(fn: (c: PoolClient) => Promise<void>) {
  const client = await testPool().connect();
  try {
    await client.query("BEGIN");
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/**
 * Runs `sql` expecting it to fail; returns the violated constraint name (or the error code).
 * Uses a savepoint so the surrounding transaction stays usable.
 */
export async function violation(
  c: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<string> {
  await c.query("SAVEPOINT expect_fail");
  try {
    await c.query(sql, params);
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT expect_fail");
    const err = e as { constraint?: string; code?: string };
    return err.constraint ?? err.code ?? "error";
  }
  await c.query("RELEASE SAVEPOINT expect_fail");
  return "NO_ERROR";
}

export async function insertFacility(
  c: PoolClient,
  code: string,
  type: string = "GENERAL_HOSPITAL"
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng)
     VALUES ($1, $2, $3, 'Dire Dawa', 'Test address', 9.59, 41.86) RETURNING id`,
    [code, `Test ${code}`, type]
  );
  return rows[0].id as string;
}

let seq = 0;
export function uniq(prefix: string) {
  seq += 1;
  return `${prefix}_${Date.now()}_${seq}`;
}

export async function insertUser(
  c: PoolClient,
  fields: {
    role?: string | null;
    facilityId?: string | null;
    phone?: string | null;
    phoneVerified?: boolean;
    receivesOtp?: boolean;
    email?: string;
    clerkId?: string;
  }
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email, phone_e164, phone_verified, receives_pickup_otp)
     VALUES ($1, $2, $3, 'Test User', $4, $5, $6, $7) RETURNING id`,
    [
      fields.clerkId ?? uniq("user"),
      fields.role ?? null,
      fields.facilityId ?? null,
      fields.email ?? `${uniq("u")}@example.test`,
      fields.phone ?? null,
      fields.phoneVerified ?? false,
      fields.receivesOtp ?? false,
    ]
  );
  return rows[0].id as string;
}

export const userSql = `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email, phone_e164, phone_verified, receives_pickup_otp)
  VALUES ($1, $2, $3, 'Test User', $4, $5, $6, $7)`;

export function userParams(f: {
  role?: string | null;
  facilityId?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  receivesOtp?: boolean;
  email?: string;
  clerkId?: string;
}) {
  return [
    f.clerkId ?? uniq("user"),
    f.role ?? null,
    f.facilityId ?? null,
    f.email ?? `${uniq("u")}@example.test`,
    f.phone ?? null,
    f.phoneVerified ?? false,
    f.receivesOtp ?? false,
  ];
}
