/**
 * Retry for READ-ONLY database calls. Neon's free plan suspends idle compute; the first connection after
 * a pause can fail with a network error while the database wakes up. Only network-level failures are
 * retried — never SQL errors (constraint violations, syntax), and never writes: a write must not risk
 * running twice (writes get idempotency keys in Gate 2 instead).
 */

const NETWORK_ERROR =
  /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|WebSocket|ErrorEvent|Connection terminated|terminating connection/i;

/** Describes an error cause, including WebSocket `ErrorEvent`s (which are not `Error`s and carry no message). */
function describeCause(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name} ${cause.message}`;
  if (cause && typeof cause === "object") {
    const name = (cause as { constructor?: { name?: string } }).constructor?.name ?? "";
    const type = (cause as { type?: unknown }).type;
    const message = (cause as { message?: unknown }).message;
    return `${name} ${typeof type === "string" ? type : ""} ${typeof message === "string" ? message : ""}`;
  }
  return String(cause ?? "");
}

export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: unknown }).cause;
  const text = `${err.name} ${err.message} ${describeCause(cause)}`;
  return NETWORK_ERROR.test(text);
}

export async function withDbRetry<T>(
  readOnly: () => Promise<T>,
  { attempts = 3, baseDelayMs = 300 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await readOnly();
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 3 ** i)); // 300 ms, 900 ms
    }
  }
  throw lastError;
}
