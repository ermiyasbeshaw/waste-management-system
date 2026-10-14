import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { AppError } from "@/server/errors";

/**
 * Scheduled jobs (`POST /api/jobs/*`) authenticate with `Authorization: Bearer <CRON_SECRET>` (CLAUDE.md §3).
 * Compared in constant time (hashes of equal length), so the secret cannot be guessed byte by byte.
 */
export function isValidCronAuth(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) return false;
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

export function requireCronAuth(req: Request): void {
  if (!isValidCronAuth(req.headers.get("authorization"), env.CRON_SECRET)) {
    throw new AppError("UNAUTHENTICATED", 401, "A valid job secret is required.");
  }
}
