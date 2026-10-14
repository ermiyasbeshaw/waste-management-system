import { describe, expect, it } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import {
  ENTITIES,
  ENTITY_STATUSES,
  TRANSITIONS,
  checkTransition,
  isAllowedMove,
  rolesInTable,
  type Entity,
  type StatusOf,
} from "@/server/workflow/table";

/**
 * The allowed moves written out again from CLAUDE.md §5 / architecture §7.5, independently of table.ts.
 * Every (from, to) pair of every entity is checked against this list: 100 % of the table.
 */
const EXPECTED: Record<Exclude<Entity, "facility" | "vehicle" | "driver">, string[]> = {
  waste: [
    "REGISTERED>SCHEDULED",
    "SCHEDULED>REGISTERED",
    "REGISTERED>CANCELLED",
    "SCHEDULED>CANCELLED",
    "SCHEDULED>IN_TRANSIT",
    "IN_TRANSIT>RECEIVED",
    "RECEIVED>DISPOSED",
    "RECEIVED>DISPOSED_WITH_EXCEPTION",
    "RECEIVED>CLOSED_NO_DESTRUCTION",
  ],
  container: [
    "LABELLED>SCANNED_AT_PICKUP",
    "SCANNED_AT_PICKUP>COLLECTED",
    "SCANNED_AT_PICKUP>LABELLED",
    "COLLECTED>RECEIVED",
    "COLLECTED>MISSING",
    "COLLECTED>REFUSED",
    "RECEIVED>DESTROYED",
  ],
  handover: ["SCANNED>CANCELLED"],
  trip: [
    "PLANNED>IN_PROGRESS",
    "IN_PROGRESS>COMPLETED",
    "PLANNED>CANCELLED",
    "IN_PROGRESS>CANCELLED",
  ],
  stop: [
    "PENDING>ARRIVED",
    "ARRIVED>COLLECTED",
    "ARRIVED>COLLECTED_OVERRIDE",
    "PENDING>SKIPPED",
    "ARRIVED>SKIPPED",
  ],
  otp: ["ISSUED>VERIFIED", "ISSUED>EXPIRED", "ISSUED>LOCKED", "ISSUED>CANCELLED"],
  certificate: [
    "PENDING>ISSUED",
    "PENDING>FAILED",
    "FAILED>ISSUED",
    "FAILED>FAILED",
    "ISSUED>REVOKED",
  ],
  invoice: ["DRAFT>ISSUED", "ISSUED>SETTLED_OFFLINE", "DRAFT>CANCELLED", "ISSUED>CANCELLED"],
  contract: ["ACTIVE>EXPIRING_SOON", "EXPIRING_SOON>EXPIRED", "ACTIVE>EXPIRED"],
  medicine_request: ["PENDING_APPROVAL>APPROVED", "PENDING_APPROVAL>REJECTED"],
};

function user(role: Role, facilityId: string | null = null): ActiveUser {
  return { id: `u-${role}`, role, facilityId, active: true };
}

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("expected an AppError");
}

describe("transition table (CLAUDE.md §5)", () => {
  for (const entity of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
    it(`${entity}: exactly the documented moves are allowed`, () => {
      const statuses = ENTITY_STATUSES[entity] as readonly string[];
      for (const from of statuses) {
        for (const to of statuses) {
          const expected = EXPECTED[entity].includes(`${from}>${to}`);
          expect(isAllowedMove(entity, from as never, to as never), `${from} → ${to}`).toBe(
            expected
          );
        }
      }
    });
  }

  it("admin-managed statuses (facility, vehicle, driver) allow any change but never a no-op", () => {
    for (const entity of ["facility", "vehicle", "driver"] as const) {
      const statuses = ENTITY_STATUSES[entity] as readonly StatusOf<typeof entity>[];
      for (const from of statuses) {
        for (const to of statuses) {
          expect(isAllowedMove(entity, from as never, to as never)).toBe(from !== to);
        }
      }
    }
  });

  it("final statuses have no way out (locked records)", () => {
    const finals: [Entity, string][] = [
      ["waste", "DISPOSED"],
      ["waste", "DISPOSED_WITH_EXCEPTION"],
      ["waste", "CLOSED_NO_DESTRUCTION"],
      ["waste", "CANCELLED"],
      ["container", "DESTROYED"],
      ["container", "MISSING"],
      ["container", "REFUSED"],
      ["trip", "COMPLETED"],
      ["trip", "CANCELLED"],
      ["stop", "COLLECTED"],
      ["stop", "COLLECTED_OVERRIDE"],
      ["stop", "SKIPPED"],
      ["certificate", "REVOKED"],
      ["invoice", "SETTLED_OFFLINE"],
      ["invoice", "CANCELLED"],
      ["contract", "EXPIRED"],
    ];
    for (const [entity, status] of finals) {
      const exits = (TRANSITIONS[entity] as readonly { from: readonly string[] }[]).filter((r) =>
        r.from.includes(status)
      );
      expect(exits, `${entity} ${status}`).toHaveLength(0);
    }
  });

  it("efda_officer appears only in the medicine request rules (CLAUDE.md §12)", () => {
    expect(rolesInTable().has("efda_officer")).toBe(true);
    for (const entity of ENTITIES.filter((e) => e !== "medicine_request")) {
      for (const rule of TRANSITIONS[entity] as readonly { who: readonly string[] }[]) {
        expect(rule.who, entity).not.toContain("efda_officer");
      }
    }
    for (const rule of TRANSITIONS.medicine_request) expect(rule.who).toEqual(["efda_officer"]);
  });
});

describe("checkTransition", () => {
  it("medicine requests: only efda_officer approves or rejects; rejecting needs a reason", () => {
    const base = { entity: "medicine_request" as const, from: "PENDING_APPROVAL" as const };
    expect(checkTransition({ ...base, to: "APPROVED", actor: user("efda_officer") }).to).toBe(
      "APPROVED"
    );
    for (const role of [
      "super_admin",
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
    ] as const) {
      expect(
        errorOf(() => checkTransition({ ...base, to: "APPROVED", actor: user(role, "f1") }))
          .httpStatus,
        role
      ).toBe(403);
    }
    expect(
      errorOf(() => checkTransition({ ...base, to: "REJECTED", actor: user("efda_officer") }))
        .httpStatus
    ).toBe(422);
    expect(
      checkTransition({
        ...base,
        to: "REJECTED",
        actor: user("efda_officer"),
        reason: "Not expired",
      }).to
    ).toBe("REJECTED");
    expect(
      errorOf(() =>
        checkTransition({
          entity: "medicine_request",
          from: "APPROVED",
          to: "REJECTED",
          actor: user("efda_officer"),
          reason: "x",
        })
      ).httpStatus
    ).toBe(409);
  });

  it("refuses a move outside the table with 409 INVALID_TRANSITION", () => {
    const err = errorOf(() =>
      checkTransition({
        entity: "waste",
        from: "DISPOSED",
        to: "REGISTERED",
        actor: user("super_admin"),
      })
    );
    expect([err.code, err.httpStatus]).toEqual(["INVALID_TRANSITION", 409]);
    expect(err.details).toEqual({ entity: "waste", from: "DISPOSED", to: "REGISTERED" });
  });

  it("efda_officer gets 403 on every move except deciding medicine requests", () => {
    for (const entity of ENTITIES.filter((e) => e !== "medicine_request")) {
      for (const rule of TRANSITIONS[entity] as readonly {
        from: readonly string[];
        to: string;
      }[]) {
        const err = errorOf(() =>
          checkTransition({
            entity,
            from: rule.from[0] as never,
            to: rule.to as never,
            actor: user("efda_officer"),
            reason: "x",
          })
        );
        expect(err.httpStatus, `${entity} → ${rule.to}`).toBe(403);
      }
    }
  });

  it("checks the role: only roles in `who` (or anyone for system moves)", () => {
    const skip = { entity: "stop" as const, from: "ARRIVED" as const, to: "SKIPPED" as const };
    expect(
      errorOf(() => checkTransition({ ...skip, actor: user("hospital_staff", "f1"), reason: "x" }))
        .httpStatus
    ).toBe(403);
    expect(checkTransition({ ...skip, actor: user("driver"), reason: "Gate closed" }).to).toBe(
      "SKIPPED"
    );

    const destroy = {
      entity: "container" as const,
      from: "RECEIVED" as const,
      to: "DESTROYED" as const,
    };
    expect(checkTransition({ ...destroy, actor: user("disposal_operator", "site") }).to).toBe(
      "DESTROYED"
    );
    expect(checkTransition({ ...destroy, actor: null }).to).toBe("DESTROYED");
  });

  it("a background job (no user) may only make system moves", () => {
    const err = errorOf(() =>
      checkTransition({ entity: "invoice", from: "DRAFT", to: "ISSUED", actor: null })
    );
    expect(err.httpStatus).toBe(403);
  });

  it("requires a written reason where the rules say so (422)", () => {
    const cancel = {
      entity: "waste" as const,
      from: "REGISTERED" as const,
      to: "CANCELLED" as const,
      actor: user("super_admin"),
    };
    for (const reason of [undefined, null, "", "   "]) {
      const err = errorOf(() => checkTransition({ ...cancel, reason }));
      expect([err.code, err.httpStatus]).toEqual(["REASON_REQUIRED", 422]);
    }
    expect(checkTransition({ ...cancel, reason: "Registered twice" }).reason).toEqual({
      column: "cancelReason",
      at: "cancelledAt",
    });
  });

  it("hospital users may only act on their own facility's records", () => {
    const cancel = {
      entity: "waste" as const,
      from: "REGISTERED" as const,
      to: "CANCELLED" as const,
      reason: "Duplicate",
    };
    const own = user("hospital_staff", "facility-a");
    expect(checkTransition({ ...cancel, actor: own, recordFacilityId: "facility-a" }).to).toBe(
      "CANCELLED"
    );
    const err = errorOf(() =>
      checkTransition({ ...cancel, actor: own, recordFacilityId: "facility-b" })
    );
    expect(err.httpStatus).toBe(403);
  });
});
