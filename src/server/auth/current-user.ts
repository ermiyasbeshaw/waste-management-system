import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, withDbRetry } from "@/server/db/client";
import { users, type User } from "@/server/db/schema";
import { env } from "@/env";
import { log } from "@/server/log";
import { checkFacilityScope, checkRole, type ActiveUser, type Role } from "./access-rules";
import { DEV_BYPASS_HEADER, devBypassApplies, hostnameOf } from "./dev-bypass";
import { DEV_ACCOUNTS } from "./dev-accounts.generated";
import {
  DEV_SESSION_COOKIE,
  TEST_IDENTITY,
  verifyDevSessionToken,
  type DevSession,
} from "./dev-session";

/**
 * Who is making this request (CLAUDE.md §4). Role, facility and active state always come from the `users`
 * table, never from Clerk metadata. The identity comes from:
 *   - the development test login (/dev-login, signed cookie → seeded user `dev_<role>`) while the development
 *     sign-in bypass is active (dev-bypass.ts; never in production), or
 *   - the Clerk session (`clerk_user_id`) otherwise.
 * Cached per request with React `cache`.
 */

/** Is this request using the development sign-in bypass? (Next 16: request headers are read asynchronously.) */
export async function isDevBypassRequest(): Promise<boolean> {
  const h = await headers();
  return devBypassApplies(hostnameOf(h.get("host")), h.get(DEV_BYPASS_HEADER));
}

/** The verified development test-login session of this request, if any. */
export async function getDevSession(): Promise<DevSession | null> {
  if (process.env.NODE_ENV !== "development" || !env.DEV_LOGIN_SECRET) return null;
  return verifyDevSessionToken(
    (await cookies()).get(DEV_SESSION_COOKIE)?.value,
    env.DEV_LOGIN_SECRET,
    DEV_ACCOUNTS,
    undefined,
    // e2e identities only in the Playwright test mode (DEV_AUTH_BYPASS=1 or always), see dev-session.ts.
    { allowTestIdentities: env.DEV_AUTH_BYPASS === "1" || env.DEV_AUTH_BYPASS === "always" }
  );
}

async function findByClerkId(clerkUserId: string): Promise<User | null> {
  const rows = await withDbRetry(() =>
    db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1)
  );
  return rows[0] ?? null;
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Test bypass mode (e.g. Playwright test header):
  if (await isDevBypassRequest()) {
    const session = await getDevSession();
    if (!session) return null;
    if (TEST_IDENTITY.test(session.username)) {
      const user = await findByClerkId(session.username);
      return user && user.role === session.role ? user : null;
    }
    return findByClerkId(`dev_${session.role}`);
  }

  // 1. Clerk authentication FIRST (real browser traffic):
  const { userId } = await auth();
  if (!userId) return null;

  // 2. Strict individual mapping: every user must have their own unique SafeWaste database profile:
  return await findByClerkId(userId);
});

/** The active authentication identifier (Clerk user ID or dev username), even before a `users` row exists. */
export const getAuthUserId = cache(async (): Promise<string | null> => {
  if (await isDevBypassRequest()) {
    const session = await getDevSession();
    if (!session) return null;
    return TEST_IDENTITY.test(session.username) ? session.username : `dev_${session.role}`;
  }
  const { userId } = await auth();
  return userId ?? null;
});

/** For layouts that must render even when the database is unreachable (e.g. public pages). */
export async function getCurrentUserSafe(): Promise<User | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    log.error("Could not load the current user", err);
    return null;
  }
}

/** Service guard: the current user if they have one of `roles`; otherwise AppError 401 / 403. */
export async function requireRole<R extends Role>(...roles: R[]): Promise<User & ActiveUser<R>> {
  const user = await getCurrentUser();
  return checkRole(user, roles) as User & ActiveUser<R>;
}

/** Facility guard for hospital roles and disposal_operator (CLAUDE.md §3). Throws AppError 403. */
export function requireFacilityScope(user: ActiveUser, facilityId: string): void {
  checkFacilityScope(user, facilityId);
}
