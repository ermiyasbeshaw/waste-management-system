/**
 * Idempotency-Key header (CLAUDE.md §6, architecture §9: a UUID on every state-changing operational command).
 * Pure parsing only; the server helper `withIdempotency` stores and replays responses.
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** How long a stored response is replayed (architecture §6.4: idempotency keys kept 24 hours). */
export const IDEMPOTENCY_TTL_HOURS = 24;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The key in lower case, or null when it is missing or not a UUID. */
export function parseIdempotencyKey(value: string | null | undefined): string | null {
  const key = value?.trim();
  return key && UUID.test(key) ? key.toLowerCase() : null;
}
