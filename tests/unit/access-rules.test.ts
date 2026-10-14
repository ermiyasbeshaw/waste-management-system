import { describe, expect, it } from "vitest";
import {
  AREA_ROLES,
  HOME_BY_ROLE,
  USER_ROLES,
  areaDecision,
  checkFacilityScope,
  checkRole,
  hasAccess,
  isRole,
  type AccessUser,
  type ActiveUser,
  type Area,
  type Role,
} from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";

function user(role: Role | null, facilityId: string | null = null, active = true): AccessUser {
  return { id: `u-${role}`, role, facilityId, active };
}

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error("expected an AppError");
}

describe("roles and areas (CLAUDE.md §3)", () => {
  it("has exactly the six roles, each with a home area that allows it", () => {
    expect([...USER_ROLES].sort()).toEqual(
      [
        "disposal_operator",
        "driver",
        "efda_officer",
        "hospital_admin",
        "hospital_staff",
        "super_admin",
      ].sort()
    );
    for (const role of USER_ROLES) {
      const homeArea = HOME_BY_ROLE[role].slice(1) as Area;
      expect(AREA_ROLES[homeArea]).toContain(role);
    }
  });

  it("rejects unknown role strings (e.g. the removed finance_officer)", () => {
    expect(isRole("finance_officer")).toBe(false);
    expect(isRole("auditor")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole("driver")).toBe(true);
  });
});

describe("checkRole (service guard)", () => {
  it("401 without a user, 403 without access, 403 for a wrong role", () => {
    expect(errorOf(() => checkRole(null, ["super_admin"])).httpStatus).toBe(401);
    expect(errorOf(() => checkRole(user(null), ["super_admin"])).httpStatus).toBe(403);
    expect(
      errorOf(() => checkRole(user("super_admin", null, false), ["super_admin"])).httpStatus
    ).toBe(403);
    expect(errorOf(() => checkRole(user("driver"), ["super_admin"])).httpStatus).toBe(403);
  });

  it("returns the user for an allowed role", () => {
    const u = checkRole(user("hospital_staff", "f1"), ["hospital_admin", "hospital_staff"]);
    expect(u.role).toBe("hospital_staff");
  });

  it("efda_officer is refused by any write guard that does not list it", () => {
    const writeRoles: Role[] = [
      "super_admin",
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
    ];
    expect(errorOf(() => checkRole(user("efda_officer"), writeRoles)).httpStatus).toBe(403);
  });
});

describe("checkFacilityScope", () => {
  const scoped = (role: Role) => user(role, "facility-A") as ActiveUser;

  it("hospital roles and disposal_operator only reach their own facility", () => {
    for (const role of ["hospital_admin", "hospital_staff", "disposal_operator"] as Role[]) {
      expect(() => checkFacilityScope(scoped(role), "facility-A")).not.toThrow();
      expect(errorOf(() => checkFacilityScope(scoped(role), "facility-B")).httpStatus).toBe(403);
    }
  });

  it("does not facility-bind super_admin, driver or efda_officer", () => {
    for (const role of ["super_admin", "driver", "efda_officer"] as Role[]) {
      expect(() => checkFacilityScope(user(role) as ActiveUser, "facility-B")).not.toThrow();
    }
  });
});

describe("areaDecision (page guard)", () => {
  it("sends a request without identity to the sign-in path it is given", () => {
    expect(areaDecision(null, "admin", "/dev-login")).toEqual({
      allow: false,
      redirectTo: "/dev-login",
    });
    // A known user without access still goes to /pending, whatever the sign-in path.
    expect(areaDecision(user(null), "admin", "/dev-login")).toEqual({
      allow: false,
      redirectTo: "/pending",
    });
  });

  it("sends people without access to /pending", () => {
    expect(areaDecision(null, "admin")).toEqual({ allow: false, redirectTo: "/pending" });
    expect(areaDecision(user(null), "hospital")).toEqual({ allow: false, redirectTo: "/pending" });
    expect(areaDecision(user("driver", null, false), "driver")).toEqual({
      allow: false,
      redirectTo: "/pending",
    });
  });

  it("every role × every area: allowed only in its own area, otherwise sent home", () => {
    const areas: Area[] = ["admin", "hospital", "driver", "disposal", "regulator"];
    for (const role of USER_ROLES) {
      for (const area of areas) {
        const decision = areaDecision(user(role, "f"), area);
        if (AREA_ROLES[area].includes(role)) expect(decision.allow).toBe(true);
        else expect(decision).toEqual({ allow: false, redirectTo: HOME_BY_ROLE[role] });
      }
    }
  });

  it("hasAccess needs an active user with a role", () => {
    expect(hasAccess(user("driver"))).toBe(true);
    expect(hasAccess(user(null))).toBe(false);
    expect(hasAccess(user("driver", null, false))).toBe(false);
  });
});
