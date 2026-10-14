import "server-only";
import { AppError } from "@/server/errors";

/**
 * Fixed-window rate limiter kept in the memory of one server instance. Enough to stop a misbehaving device or
 * script from flooding one instance; a shared limiter (database or edge) is part of the Gate 7.2 security review.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 10_000;

  return {
    /** Counts one hit for `key`; throws 429 RATE_LIMITED once the window's limit is passed. */
    hit(key: string, now = Date.now()): void {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) {
          hits.forEach((e, k) => {
            if (e.resetAt <= now) hits.delete(k);
          });
        }
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return;
      }
      entry.count += 1;
      if (entry.count > opts.limit) {
        throw new AppError("RATE_LIMITED", 429, undefined, {
          retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
        });
      }
    },
  };
}
