/**
 * Transition table (CLAUDE.md §5, architecture §7.5). Pure data + pure checks, no I/O, so every allowed and every
 * refused move is unit-tested. The Workflow Engine (`engine.ts`) applies it inside a transaction.
 *
 * `who` lists the roles that may make the move directly. "system" means the move is a side effect of another
 * authorised command (stop completion, a job, …): any active role except efda_officer — or no user at all
 * (background job) — may trigger it; the calling service is responsible for having authorised that command.
 */
import { AppError } from "@/server/errors";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import {
  certificateStatus,
  containerStatus,
  contractStatus,
  driverStatus,
  facilityStatus,
  handoverStatus,
  invoiceStatus,
  medicineRequestStatus,
  otpStatus,
  stopStatus,
  tripStatus,
  vehicleStatus,
  wasteStatus,
} from "@/server/db/schema/enums";

export const ENTITY_STATUSES = {
  waste: wasteStatus.enumValues,
  container: containerStatus.enumValues,
  handover: handoverStatus.enumValues,
  trip: tripStatus.enumValues,
  stop: stopStatus.enumValues,
  otp: otpStatus.enumValues,
  certificate: certificateStatus.enumValues,
  invoice: invoiceStatus.enumValues,
  contract: contractStatus.enumValues,
  facility: facilityStatus.enumValues,
  vehicle: vehicleStatus.enumValues,
  driver: driverStatus.enumValues,
  medicine_request: medicineRequestStatus.enumValues,
} as const;

export type Entity = keyof typeof ENTITY_STATUSES;
export type StatusOf<E extends Entity> = (typeof ENTITY_STATUSES)[E][number];
export const ENTITIES = Object.keys(ENTITY_STATUSES) as Entity[];

export type Who = readonly (Role | "system")[];

/** Where the reason is stored (camelCase column names); `at` is set to the transition time. */
export interface ReasonSpec {
  column?: string;
  at?: string;
}

export interface Rule<E extends Entity> {
  from: readonly StatusOf<E>[];
  to: StatusOf<E>;
  who: Who;
  /** Present = a written reason is required. No column = kept in the audit log only. */
  reason?: ReasonSpec;
}

type Table = { [E in Entity]: readonly Rule<E>[] };

const HOSPITAL: Who = ["hospital_admin", "hospital_staff"];
const SYSTEM: Who = ["system"];
const ADMIN: Who = ["super_admin"];
const OPERATOR: Who = ["disposal_operator"];

/** Every move between distinct statuses (for admin-managed statuses without a state machine). */
function anyToAny<E extends Entity>(entity: E, who: Who): Rule<E>[] {
  const all = ENTITY_STATUSES[entity] as readonly StatusOf<E>[];
  return all.map((to) => ({ from: all.filter((s) => s !== to), to, who }));
}

export const TRANSITIONS: Table = {
  waste: [
    { from: ["REGISTERED"], to: "SCHEDULED", who: ADMIN },
    { from: ["SCHEDULED"], to: "REGISTERED", who: SYSTEM },
    {
      from: ["REGISTERED", "SCHEDULED"],
      to: "CANCELLED",
      who: [...HOSPITAL, "super_admin"],
      reason: { column: "cancelReason", at: "cancelledAt" },
    },
    { from: ["SCHEDULED"], to: "IN_TRANSIT", who: SYSTEM },
    { from: ["IN_TRANSIT"], to: "RECEIVED", who: OPERATOR },
    { from: ["RECEIVED"], to: "DISPOSED", who: OPERATOR },
    { from: ["RECEIVED"], to: "DISPOSED_WITH_EXCEPTION", who: OPERATOR },
    // DECISION v1.2 addendum. ASSUMPTION: the reason is kept in the audit log (per-container reasons are stored).
    { from: ["RECEIVED"], to: "CLOSED_NO_DESTRUCTION", who: OPERATOR, reason: {} },
  ],
  container: [
    { from: ["LABELLED"], to: "SCANNED_AT_PICKUP", who: ["driver"] },
    { from: ["SCANNED_AT_PICKUP"], to: "COLLECTED", who: SYSTEM },
    { from: ["SCANNED_AT_PICKUP"], to: "LABELLED", who: SYSTEM },
    { from: ["COLLECTED"], to: "RECEIVED", who: OPERATOR },
    { from: ["COLLECTED"], to: "MISSING", who: OPERATOR, reason: { column: "exceptionReason" } },
    { from: ["COLLECTED"], to: "REFUSED", who: OPERATOR, reason: { column: "exceptionReason" } },
    { from: ["RECEIVED"], to: "DESTROYED", who: SYSTEM },
  ],
  handover: [{ from: ["SCANNED"], to: "CANCELLED", who: SYSTEM }],
  trip: [
    { from: ["PLANNED"], to: "IN_PROGRESS", who: ["driver"] },
    // DECISION v1.2 addendum: all stops final AND every collected container accounted for at the site.
    { from: ["IN_PROGRESS"], to: "COMPLETED", who: SYSTEM },
    {
      from: ["PLANNED", "IN_PROGRESS"],
      to: "CANCELLED",
      who: ADMIN,
      reason: { column: "cancelReason", at: "cancelledAt" },
    },
  ],
  stop: [
    { from: ["PENDING"], to: "ARRIVED", who: ["driver"] },
    // OTP verified by the driver, or in-app confirmation by a hospital user of the same facility.
    { from: ["ARRIVED"], to: "COLLECTED", who: ["driver", ...HOSPITAL] },
    {
      from: ["ARRIVED"],
      to: "COLLECTED_OVERRIDE",
      who: ADMIN,
      reason: { column: "overrideReason" },
    },
    {
      from: ["PENDING", "ARRIVED"],
      to: "SKIPPED",
      who: ["driver", "super_admin"],
      reason: { column: "skipReason" },
    },
  ],
  otp: [
    { from: ["ISSUED"], to: "VERIFIED", who: SYSTEM },
    { from: ["ISSUED"], to: "EXPIRED", who: SYSTEM },
    { from: ["ISSUED"], to: "LOCKED", who: SYSTEM },
    { from: ["ISSUED"], to: "CANCELLED", who: SYSTEM },
  ],
  certificate: [
    { from: ["PENDING", "FAILED"], to: "ISSUED", who: SYSTEM },
    // A failed retry stays FAILED (architecture §7.5 "PENDING/FAILED → FAILED").
    { from: ["PENDING", "FAILED"], to: "FAILED", who: SYSTEM },
    {
      from: ["ISSUED"],
      to: "REVOKED",
      who: ADMIN,
      reason: { column: "revokedReason", at: "revokedAt" },
    },
  ],
  invoice: [
    { from: ["DRAFT"], to: "ISSUED", who: ADMIN },
    { from: ["ISSUED"], to: "SETTLED_OFFLINE", who: ADMIN },
    {
      from: ["DRAFT", "ISSUED"],
      to: "CANCELLED",
      who: ADMIN,
      reason: { column: "cancelReason", at: "cancelledAt" },
    },
  ],
  contract: [
    { from: ["ACTIVE"], to: "EXPIRING_SOON", who: SYSTEM },
    { from: ["EXPIRING_SOON"], to: "EXPIRED", who: SYSTEM },
    // ASSUMPTION: a contract shorter than the warning window (or a missed job day) goes straight to EXPIRED.
    { from: ["ACTIVE"], to: "EXPIRED", who: SYSTEM },
  ],
  // ASSUMPTION: no state machine in the architecture for these; super_admin (and the trip workflow) may set any.
  facility: anyToAny("facility", ADMIN),
  vehicle: anyToAny("vehicle", ["super_admin", "system"]),
  driver: anyToAny("driver", ["super_admin", "system"]),
  // CLAUDE.md §12 (owner decision 11 Oct 2026): only the EFDA officer decides medicine disposal requests.
  medicine_request: [
    { from: ["PENDING_APPROVAL"], to: "APPROVED", who: ["efda_officer"] },
    {
      from: ["PENDING_APPROVAL"],
      to: "REJECTED",
      who: ["efda_officer"],
      reason: { column: "decisionReason" },
    },
  ],
};

/**
 * The only entities efda_officer may change (CLAUDE.md §3 / §12). Every other move by efda_officer is refused
 * with 403 before any row is read.
 */
export const EFDA_WRITABLE_ENTITIES: readonly Entity[] = ["medicine_request"];

export function findRule<E extends Entity>(
  entity: E,
  from: StatusOf<E>,
  to: StatusOf<E>
): Rule<E> | undefined {
  return (TRANSITIONS[entity] as readonly Rule<E>[]).find(
    (r) => r.to === to && r.from.includes(from)
  );
}

export function isAllowedMove<E extends Entity>(entity: E, from: StatusOf<E>, to: StatusOf<E>) {
  return findRule(entity, from, to) !== undefined;
}

/** null = a background job with no signed-in user. */
export type Actor = ActiveUser | null;

const HOSPITAL_ROLES: readonly Role[] = ["hospital_admin", "hospital_staff"];

/**
 * Checks one move without touching the database. Throws:
 * 403 FORBIDDEN (efda_officer except medicine requests; role not in `who`), 409 INVALID_TRANSITION (move not in the table),
 * 422 REASON_REQUIRED, 403 when a hospital user acts on another facility's record.
 */
export function checkTransition<E extends Entity>(input: {
  entity: E;
  from: StatusOf<E>;
  to: StatusOf<E>;
  actor: Actor;
  reason?: string | null;
  /** facility_id of the record, when it has one. */
  recordFacilityId?: string | null;
}): Rule<E> {
  const { entity, from, to, actor } = input;
  if (actor?.role === "efda_officer" && !EFDA_WRITABLE_ENTITIES.includes(entity)) {
    throw new AppError("FORBIDDEN", 403, "The EFDA officer role is read-only.");
  }
  const rule = findRule(entity, from, to);
  if (!rule) {
    throw new AppError("INVALID_TRANSITION", 409, `${entity} cannot move from ${from} to ${to}.`, {
      entity,
      from,
      to,
    });
  }
  const bySystem = rule.who.includes("system");
  const allowed = actor === null ? bySystem : bySystem || rule.who.includes(actor.role);
  if (!allowed) {
    throw new AppError("FORBIDDEN", 403, `This role cannot move ${entity} to ${to}.`, {
      entity,
      to,
    });
  }
  if (rule.reason && !input.reason?.trim()) {
    throw new AppError("REASON_REQUIRED", 422, "A written reason is required.", { entity, to });
  }
  if (
    actor &&
    HOSPITAL_ROLES.includes(actor.role) &&
    input.recordFacilityId !== undefined &&
    input.recordFacilityId !== actor.facilityId
  ) {
    throw new AppError("FORBIDDEN", 403, "This record belongs to another facility.");
  }
  return rule;
}

/** Every role that appears anywhere in the table — used by tests to prove efda_officer never does. */
export function rolesInTable(): Set<Role> {
  const roles = new Set<Role>();
  for (const e of ENTITIES) {
    for (const r of TRANSITIONS[e] as readonly Rule<Entity>[]) {
      for (const w of r.who) if (w !== "system") roles.add(w);
    }
  }
  return roles;
}
