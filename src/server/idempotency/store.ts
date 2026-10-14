import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { IDEMPOTENCY_TTL_HOURS, parseIdempotencyKey } from "@/lib/idempotency/key";
import { canonicalJson, toJsonValue, type JsonValue } from "@/server/audit/hash";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";

/**
 * Idempotency (CLAUDE.md §6, architecture §9): the key is checked and stored in the SAME transaction as the
 * business action, so a double tap or a retry on a weak signal takes effect once.
 *
 * - First request: the key row is inserted, the action runs, the response is stored — all commit together.
 * - Concurrent duplicate: its INSERT waits on the unique index until the first commits, then replays.
 * - If the action fails, the transaction rolls back with the key, so a retry runs the action again.
 * - Same key with a different body → 422 IDEMPOTENCY_KEY_REUSED. Keys older than 24 h are forgotten.
 */

export interface IdempotencyScope {
  /** The raw `Idempotency-Key` header value. */
  key: string | null | undefined;
  /** The signed-in user (null for system jobs). */
  userId: string | null;
  /** Route or command name, e.g. "POST /api/stops/:id/arrive" — keys are unique per user + route. */
  route: string;
  /** The validated request (params + body) — used to detect a reused key. */
  request: unknown;
}

export interface CommandResponse<T> {
  status: number;
  body: T;
}

export type IdempotentResponse<T> = CommandResponse<T> & { replayed: boolean };

/** Validates the header; 400 IDEMPOTENCY_KEY_REQUIRED when it is missing or not a UUID. */
export function requireIdempotencyKey(value: string | null | undefined): string {
  const key = parseIdempotencyKey(value);
  if (!key) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
      "This action needs an Idempotency-Key header (a UUID)."
    );
  }
  return key;
}

export function requestHash(route: string, request: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(toJsonValue({ route, request })), "utf8")
    .digest("hex");
}

export async function withIdempotency<T extends JsonValue>(
  tx: DbExecutor,
  scope: IdempotencyScope,
  run: () => Promise<CommandResponse<T>>
): Promise<IdempotentResponse<T>> {
  const key = requireIdempotencyKey(scope.key);
  const hash = requestHash(scope.route, scope.request);
  const sameKey = sql`user_id IS NOT DISTINCT FROM ${scope.userId} AND route = ${scope.route} AND key = ${key}`;

  // An expired key may be used again.
  await tx.execute(
    sql`DELETE FROM idempotency_keys WHERE ${sameKey}
        AND created_at < now() - make_interval(hours => ${IDEMPOTENCY_TTL_HOURS})`
  );

  const inserted = await tx.execute(
    sql`INSERT INTO idempotency_keys (key, user_id, route, request_hash)
        VALUES (${key}, ${scope.userId}, ${scope.route}, ${hash})
        ON CONFLICT ON CONSTRAINT idempotency_keys_user_route_key_unique DO NOTHING
        RETURNING id`
  );

  if (inserted.rows.length === 1) {
    const response = await run();
    await tx.execute(
      sql`UPDATE idempotency_keys
          SET response_status = ${response.status}, response_body = ${JSON.stringify(toJsonValue(response.body))}::jsonb
          WHERE id = ${inserted.rows[0].id as string}`
    );
    return { ...response, replayed: false };
  }

  const existing = await tx.execute(
    sql`SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE ${sameKey}`
  );
  const row = existing.rows[0] as
    { request_hash: string; response_status: number | null; response_body: T | null } | undefined;
  if (!row || row.response_status === null) {
    // Only possible if the first request is still running outside a transaction — refuse rather than guess.
    throw new AppError(
      "IDEMPOTENCY_IN_PROGRESS",
      409,
      "The same request is still being processed."
    );
  }
  if (row.request_hash !== hash) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      422,
      "This Idempotency-Key was already used for a different request."
    );
  }
  return { status: row.response_status, body: row.response_body as T, replayed: true };
}

/** Daily job: forget keys older than 24 h. Returns how many were removed. */
export async function purgeExpiredIdempotencyKeys(tx: DbExecutor): Promise<number> {
  const result = await tx.execute(
    sql`DELETE FROM idempotency_keys
        WHERE created_at < now() - make_interval(hours => ${IDEMPOTENCY_TTL_HOURS})`
  );
  return result.rowCount ?? 0;
}
