import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import type { DbExecutor } from "./executor";
import * as schema from "./schema";

/**
 * Database access (CLAUDE.md §8: only server code in src/server touches the database).
 * Uses Neon's WebSocket pool driver because the Workflow Engine needs interactive transactions
 * (status change + audit row + outbox message commit together). Pooled URL for the app.
 */

const globalForDb = globalThis as unknown as { __safewastePool?: Pool };

// Reuse one pool across hot reloads in development.
// A dropped WebSocket must fail fast (then reads are retried, see retry.ts) instead of hanging the request.
const pool =
  globalForDb.__safewastePool ??
  new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
if (env.NODE_ENV !== "production") globalForDb.__safewastePool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Db = typeof db;
export { withDbRetry } from "./retry";

/**
 * Runs `fn` in ONE database transaction on ONE dedicated connection (BEGIN … COMMIT / ROLLBACK).
 *
 * Do not use `db.transaction()` directly: drizzle picks a dedicated connection only when `client instanceof Pool`,
 * and under the Next.js bundler the Neon `Pool` class can exist twice, so the check fails and the statements of
 * one "transaction" are spread over several pooled connections (found 10 Oct 2026: SAVEPOINT outside a
 * transaction). Checking out the connection ourselves makes the transaction real in every runtime.
 */
export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    return await drizzle(client, { schema, casing: "snake_case" }).transaction(fn);
  } catch (err) {
    // A network failure may leave the connection unusable: discard it instead of returning it to the pool.
    broken = !(err instanceof AppError);
    throw err;
  } finally {
    client.release(broken);
  }
}
