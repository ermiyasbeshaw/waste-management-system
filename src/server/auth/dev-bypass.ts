/**
 * DEVELOPMENT-ONLY sign-in bypass. Never active in a production build.
 *
 * Modes (server env `DEV_AUTH_BYPASS`):
 *   - unset / "0"  normal Clerk sign-in.
 *   - "1"          only requests that carry the header `x-dev-auth-bypass: 1` skip Clerk
 *                  (the Playwright test server, so tests can also check the real signed-out redirect).
 *   - "always"     every request skips Clerk (owner's local dev server while Clerk users are postponed —
 *                  DECISION 8 Oct 2026: build the role features first, connect Clerk users last).
 * In all modes the request must come to localhost, and NODE_ENV must be "development".
 * `src/lib/env-schema.ts` refuses any bypass mode in production.
 *
 * With the bypass, the identity comes from the development test login (/dev-login: username + password per
 * dashboard, signed cookie — see dev-session.ts); the matching seeded `dev_<role>` user is loaded from the
 * `users` table and every role check still runs on the server.
 */
export const DEV_BYPASS_HEADER = "x-dev-auth-bypass";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Hostname without port, e.g. "localhost:3000" → "localhost". */
export function hostnameOf(host: string | null | undefined): string {
  if (!host) return "";
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0];
}

export function devBypassApplies(hostname: string, headerValue: string | null): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (!LOCAL_HOSTS.has(hostname)) return false;
  const mode = process.env.DEV_AUTH_BYPASS;
  if (mode === "always") return true;
  return mode === "1" && headerValue === "1";
}

/** Middleware form. */
export function isDevAuthBypass(req: { headers: Headers; nextUrl: { hostname: string } }): boolean {
  return devBypassApplies(req.nextUrl.hostname, req.headers.get(DEV_BYPASS_HEADER));
}
