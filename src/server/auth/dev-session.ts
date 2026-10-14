/**
 * Development test login (/dev-login): password check and signed session cookie. Pure Node code (no Next.js
 * imports) so it is unit-tested. Used only while the development sign-in bypass is active; production uses
 * Clerk. The cookie is `base64url(payload).base64url(HMAC-SHA256)`, signed with DEV_LOGIN_SECRET, so it
 * cannot be forged or changed in the browser (unlike the old role-switcher cookie).
 */
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { isRole, type Role } from "./access-rules";
import type { DevAccount } from "./dev-accounts.generated";

export const DEV_SESSION_COOKIE = "sw_dev_session";
/** Test sessions last 12 hours. */
export const DEV_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface DevSession {
  username: string;
  role: Role;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/** Constant-time password check against the scrypt hash. Unknown usernames take the same time. */
export function checkDevPassword(
  accounts: readonly DevAccount[],
  username: string,
  password: string
): DevAccount | null {
  const account = accounts.find((a) => a.username === username.trim().toLowerCase());
  const salt = account?.salt ?? "0".repeat(32);
  const expected = Buffer.from(account?.hash ?? "0".repeat(128), "hex");
  const actual = scryptSync(password, salt, 64);
  const match = timingSafeEqual(actual, expected);
  return account && match ? account : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createDevSessionToken(
  account: Pick<DevAccount, "username" | "role">,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): string {
  const session: DevSession = {
    username: account.username,
    role: account.role,
    exp: nowSeconds + DEV_SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Returns the session if the signature is valid, it has not expired, and the username still exists with the
 * same role (regenerating the accounts invalidates stale cookies). Otherwise null.
 */
/**
 * Throw-away e2e identities (`e2e_…`): accepted ONLY when the caller passes `allowTestIdentities` — the
 * Playwright test mode (DEV_AUTH_BYPASS=1), never the owner's dev server and never production. The session then
 * names its own `users.clerk_user_id`, so end-to-end tests never touch the seeded demo users.
 */
export const TEST_IDENTITY = /^e2e_[a-z0-9_-]{8,64}$/;

export function verifyDevSessionToken(
  token: string | undefined,
  secret: string,
  accounts: readonly DevAccount[],
  nowSeconds = Math.floor(Date.now() / 1000),
  opts: { allowTestIdentities?: boolean } = {}
): DevSession | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as DevSession;
    if (typeof session.exp !== "number" || session.exp <= nowSeconds) return null;
    if (opts.allowTestIdentities && TEST_IDENTITY.test(session.username)) {
      return isRole(session.role) ? session : null;
    }
    const account = accounts.find((a) => a.username === session.username);
    if (!account || account.role !== session.role) return null;
    return session;
  } catch {
    return null;
  }
}
