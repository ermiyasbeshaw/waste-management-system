/**
 * Pure access rules (CLAUDE.md §3). No I/O here, so every rule is unit-tested; the server wrappers in
 * `current-user.ts` and `area-guard.ts` apply them to the user loaded from the `users` table.
 */
import { AppError } from "@/server/errors";

export const USER_ROLES = [
  "super_admin",
  "hospital_admin",
  "hospital_staff",
  "driver",
  "disposal_operator",
  "efda_officer",
] as const;
export type Role = (typeof USER_ROLES)[number];

export type Area = "admin" | "hospital" | "driver" | "disposal" | "regulator";

/** Roles allowed in each area. */
export const AREA_ROLES: Record<Area, readonly Role[]> = {
  admin: ["super_admin"],
  hospital: ["hospital_admin", "hospital_staff"],
  driver: ["driver"],
  disposal: ["disposal_operator"],
  regulator: ["efda_officer"],
};

/** Where `/` sends each role. */
export const HOME_BY_ROLE: Record<Role, string> = {
  super_admin: "/admin",
  hospital_admin: "/hospital",
  hospital_staff: "/hospital",
  driver: "/driver",
  disposal_operator: "/disposal",
  efda_officer: "/regulator",
};

/** Roles whose data is limited to their own facility. */
const FACILITY_SCOPED: readonly Role[] = ["hospital_admin", "hospital_staff", "disposal_operator"];

/** The fields the rules need (a `users` row satisfies this). */
export interface AccessUser {
  id: string;
  role: Role | null;
  facilityId: string | null;
  active: boolean;
}

/** A user who may use the app: active and has a role. */
export type ActiveUser<R extends Role = Role> = AccessUser & { role: R };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Has access at all (row exists, active, role assigned)? Otherwise the person waits on /pending. */
export function hasAccess(user: AccessUser | null): user is ActiveUser {
  return user !== null && user.active && user.role !== null;
}

/** Service guard: returns the user narrowed to the allowed roles, or throws 401 / 403. */
export function checkRole<R extends Role>(
  user: AccessUser | null,
  roles: readonly R[]
): ActiveUser<R> {
  if (!user) throw new AppError("UNAUTHENTICATED");
  if (!hasAccess(user)) throw new AppError("FORBIDDEN", 403, "Your account has no access yet.");
  if (!(roles as readonly Role[]).includes(user.role)) throw new AppError("FORBIDDEN");
  return user as ActiveUser<R>;
}

/**
 * Facility scope: hospital roles and disposal_operator may only touch their own facility.
 * super_admin, driver and efda_officer are not facility-bound here (their own rules apply elsewhere).
 */
export function checkFacilityScope(user: ActiveUser, facilityId: string): void {
  if (FACILITY_SCOPED.includes(user.role) && user.facilityId !== facilityId) {
    throw new AppError("FORBIDDEN", 403, "This record belongs to another facility.");
  }
}

/**
 * Page guard decision for an area layout.
 * `signInPath` is where a request without any identity goes: /dev-login with the development bypass,
 * otherwise /pending (a Clerk-signed-in person without a `users` row; the middleware already required sign-in).
 * A known user without access (no role or inactive) always goes to /pending.
 */
export function areaDecision(
  user: AccessUser | null,
  area: Area,
  signInPath = "/pending"
): { allow: true; user: ActiveUser } | { allow: false; redirectTo: string } {
  if (user === null) return { allow: false, redirectTo: signInPath };
  if (!hasAccess(user)) return { allow: false, redirectTo: "/pending" };
  if (!AREA_ROLES[area].includes(user.role)) {
    return { allow: false, redirectTo: HOME_BY_ROLE[user.role] };
  }
  return { allow: true, user };
}
