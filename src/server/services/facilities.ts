import "server-only";
import { eq } from "drizzle-orm";
import {
  facilitySchema,
  facilityStatusSchema,
  userAccessSchema,
  hospitalUserSchema,
} from "@/lib/validation/facility";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import type { DbExecutor } from "@/server/db/executor";
import { facilities, users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { friendlyDbError, invalid } from "./_errors";
import { inWorkflow, transition } from "@/server/workflow/engine";

/**
 * Facilities and user access (CLAUDE.md §3–§4, Appendix C): super_admin manages facilities and every user's role,
 * facility, active flag and OTP-recipient flag; hospital_admin manages the active / OTP-recipient flags of their
 * own facility's hospital users. Identity (name, email, phone, verification) comes from Clerk and is never edited
 * here. Every change is audited; status changes go through the Workflow Engine.
 */

export async function createFacility(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = facilitySchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const [row] = await tx
      .insert(facilities)
      .values(parsed.data)
      .returning({ id: facilities.id, code: facilities.code })
      .catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "facility.created",
      entityType: "facility",
      entityId: row.id,
      after: parsed.data,
      requestId,
    });
    return row;
  });
}

export async function updateFacility(code: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = facilitySchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const [before] = await tx.select().from(facilities).where(eq(facilities.code, code)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", 404, "Facility not found.");
    if (parsed.data.code !== before.code) {
      throw new AppError("VALIDATION_ERROR", 422, "Facility codes never change.", {
        fields: { code: ["Facility codes never change"] },
      });
    }
    if (
      parsed.data.type !== before.type &&
      (before.type === "DISPOSAL_SITE" || parsed.data.type === "DISPOSAL_SITE")
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "A facility cannot become or stop being the disposal site.",
        {
          fields: { type: ["The disposal site type cannot be changed"] },
        }
      );
    }
    await tx
      .update(facilities)
      .set(parsed.data)
      .where(eq(facilities.id, before.id))
      .catch(friendlyDbError);
    const changed = Object.fromEntries(
      Object.entries(parsed.data).filter(([k, v]) => before[k as keyof typeof before] !== v)
    );
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "facility.updated",
      entityType: "facility",
      entityId: before.id,
      before: Object.fromEntries(
        Object.keys(changed).map((k) => [k, before[k as keyof typeof before]])
      ),
      after: changed,
      requestId,
    });
    return { id: before.id, code: before.code };
  });
}

export async function setFacilityStatus(code: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = facilityStatusSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const [f] = await tx
      .select({ id: facilities.id })
      .from(facilities)
      .where(eq(facilities.code, code))
      .limit(1);
    if (!f) throw new AppError("NOT_FOUND", 404, "Facility not found.");
    const result = await transition(tx, {
      entity: "facility",
      id: f.id,
      to: parsed.data.status,
      actor: admin,
      action: "facility.status_changed",
      requestId,
    });
    return { code, from: result.from, to: result.to };
  });
}

/** Loads a user row for an access change, enforcing that nobody locks themselves out. */
async function loadTarget(tx: DbExecutor, actor: ActiveUser, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new AppError("NOT_FOUND", 404, "User not found.");
  const [u] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AppError("NOT_FOUND", 404, "User not found.");
  return u;
}

export async function updateUserAccess(userId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = userAccessSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const input = parsed.data;
  return inWorkflow(async (tx) => {
    const before = await loadTarget(tx, admin, userId);
    if (before.id === admin.id && (input.role !== "super_admin" || !input.active)) {
      throw new AppError("FORBIDDEN", 403, "You cannot remove your own administrator access.");
    }
    let facilityId: string | null = null;
    if (input.facilityCode) {
      const [f] = await tx
        .select({ id: facilities.id })
        .from(facilities)
        .where(eq(facilities.code, input.facilityCode))
        .limit(1);
      if (!f)
        throw new AppError("VALIDATION_ERROR", 422, "Unknown facility.", {
          fields: { facilityCode: ["Unknown facility"] },
        });
      facilityId = f.id;
    }
    const values = {
      role: input.role,
      facilityId,
      active: input.active,
      receivesPickupOtp: input.receivesPickupOtp,
    };
    await tx.update(users).set(values).where(eq(users.id, before.id)).catch(friendlyDbError);
    const roleChanged = before.role !== input.role || before.facilityId !== facilityId;
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: roleChanged ? "user.role_changed" : "user.access_changed",
      entityType: "user",
      entityId: before.id,
      before: {
        role: before.role,
        facilityId: before.facilityId,
        active: before.active,
        receivesPickupOtp: before.receivesPickupOtp,
      },
      after: values,
      requestId,
    });
    return { id: before.id };
  });
}

/** hospital_admin: active / OTP-recipient flags of hospital users of their OWN facility. */
export async function updateHospitalUser(userId: string, raw: unknown, requestId?: string) {
  const admin = await requireRole("hospital_admin");
  const parsed = hospitalUserSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  return inWorkflow(async (tx) => {
    const before = await loadTarget(tx, admin, userId);
    // Another facility's user (or a non-hospital user) is "not found": no existence leak.
    if (
      before.facilityId !== admin.facilityId ||
      (before.role !== "hospital_admin" && before.role !== "hospital_staff")
    ) {
      throw new AppError("NOT_FOUND", 404, "User not found.");
    }
    if (before.id === admin.id && !parsed.data.active) {
      throw new AppError("FORBIDDEN", 403, "You cannot deactivate your own account.");
    }
    await tx.update(users).set(parsed.data).where(eq(users.id, before.id)).catch(friendlyDbError);
    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "user.access_changed",
      entityType: "user",
      entityId: before.id,
      before: { active: before.active, receivesPickupOtp: before.receivesPickupOtp },
      after: parsed.data,
      requestId,
    });
    return { id: before.id };
  });
}
