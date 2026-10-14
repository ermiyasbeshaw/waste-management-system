import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@/server/db/schema";
import { areaDecision, type ActiveUser, type Area } from "./access-rules";
import { getCurrentUser, isDevBypassRequest } from "./current-user";

export type { Area } from "./access-rules";
export { AREA_ROLES, HOME_BY_ROLE } from "./access-rules";

/**
 * Area layout guard (CLAUDE.md §3, second of the three checks: middleware → area layout → service).
 * No identity → /dev-login (development bypass) or /pending; no role or inactive → /pending;
 * a role from another area → that role's own area.
 * The service-level `requireRole` is still the check that matters for every action.
 */
export async function requireAreaAccess(area: Area): Promise<User & ActiveUser> {
  const signInPath = (await isDevBypassRequest()) ? "/dev-login" : "/pending";
  const decision = areaDecision(await getCurrentUser(), area, signInPath);
  if (!decision.allow) redirect(decision.redirectTo);
  return decision.user as User & ActiveUser;
}
