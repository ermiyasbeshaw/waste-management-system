import "server-only";
import { and, eq, ne, or, sql } from "drizzle-orm";
import {
  onboardingRequestSchema,
  provisionUserSchema,
  rejectRequestSchema,
  type OnboardingRequestInput,
  type ProvisionUserInput,
} from "@/lib/validation/onboarding";
import { writeAudit } from "@/server/audit/writer";
import { getCurrentUser, requireRole } from "@/server/auth/current-user";
import type { DbExecutor } from "@/server/db/executor";
import {
  drivers,
  facilities,
  onboardingRequests,
  users,
  vehicles,
  type FacilityTypeValue,
  type UserRoleValue,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { inWorkflow } from "@/server/workflow/engine";
import { friendlyDbError, invalid } from "./_errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function typeToCodePrefix(type: FacilityTypeValue): string {
  switch (type) {
    case "REFERRAL_HOSPITAL":
      return "REF";
    case "GENERAL_HOSPITAL":
      return "GEN";
    case "PRIMARY_HOSPITAL":
      return "PRI";
    case "CLINIC":
      return "CLI";
    case "PHARMACY":
      return "PHA";
    case "DISPOSAL_SITE":
      return "DIS";
    default:
      return "GEN";
  }
}

async function nextFacilityCode(tx: DbExecutor, type: FacilityTypeValue): Promise<string> {
  const prefix = `DD-${typeToCodePrefix(type)}`;
  const { rows } = await tx.execute(
    sql`SELECT coalesce(max(substring(code from 8 for 3)::int), 0) + 1 AS next_num
        FROM facilities WHERE code LIKE ${prefix + "-%"}`
  );
  const nextNum = (rows[0] as { next_num: number }).next_num;
  return `${prefix}-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Path A: Self-request onboarding (CLAUDE.md & prompt).
 * Any authenticated user submits their onboarding request.
 * Initializes with PENDING_REVIEW status and grants ZERO operational access until approved.
 */
export async function submitOnboardingRequest(
  raw: unknown,
  clerkUserId: string,
  requestId?: string
) {
  const parsed = onboardingRequestSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const data = parsed.data;

  return inWorkflow(async (tx) => {
    const normalizedEmail = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();
    const phoneE164 = data.phoneE164?.trim() || null;

    // Check if user already exists in users table by clerkUserId OR email:
    const [existingUser] = await tx
      .select({ id: users.id, role: users.role, active: users.active, clerkUserId: users.clerkUserId })
      .from(users)
      .where(or(eq(users.clerkUserId, clerkUserId), eq(users.email, normalizedEmail)))
      .limit(1);

    // If requesting hospital_admin for an existing facility, verify no active admin currently exists
    if (data.requestedRole === "hospital_admin" && data.facilityId) {
      const [existingAdmin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.facilityId, data.facilityId),
            eq(users.role, "hospital_admin"),
            eq(users.active, true),
            existingUser ? ne(users.id, existingUser.id) : sql`TRUE`
          )
        )
        .limit(1);
      if (existingAdmin) {
        throw new AppError(
          "HOSPITAL_ADMIN_EXISTS",
          409,
          "This hospital already has an active Hospital Administrator."
        );
      }
    }

    // Check if there is already a pending request for this Clerk user OR email
    const [existingRequest] = await tx
      .select({ id: onboardingRequests.id })
      .from(onboardingRequests)
      .where(
        and(
          or(
            eq(onboardingRequests.clerkUserId, clerkUserId),
            eq(onboardingRequests.email, normalizedEmail)
          ),
          eq(onboardingRequests.status, "PENDING_REVIEW")
        )
      )
      .limit(1);

    let onboardingId: string;
    if (existingRequest) {
      // Update existing pending request
      onboardingId = existingRequest.id;
      await tx
        .update(onboardingRequests)
        .set({
          clerkUserId,
          fullName,
          email: normalizedEmail,
          phoneE164,
          requestedRole: data.requestedRole,
          facilityId: data.facilityId || null,
          facilityName: data.facilityName || null,
          facilityType: data.facilityType || null,
          facilityRegion: data.facilityRegion || null,
          facilityCity: data.facilityCity || null,
          facilityAddress: data.facilityAddress || null,
          facilityLat: data.facilityLat ?? null,
          facilityLng: data.facilityLng ?? null,
          notes: data.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(onboardingRequests.id, onboardingId));
    } else {
      const [newRow] = await tx
        .insert(onboardingRequests)
        .values({
          clerkUserId,
          fullName,
          email: normalizedEmail,
          phoneE164,
          requestedRole: data.requestedRole,
          facilityId: data.facilityId || null,
          facilityName: data.facilityName || null,
          facilityType: data.facilityType || null,
          facilityRegion: data.facilityRegion || null,
          facilityCity: data.facilityCity || null,
          facilityAddress: data.facilityAddress || null,
          facilityLat: data.facilityLat ?? null,
          facilityLng: data.facilityLng ?? null,
          notes: data.notes || null,
          status: "PENDING_REVIEW",
        })
        .returning({ id: onboardingRequests.id });
      onboardingId = newRow.id;
    }

    // Fail-closed user profile synchronization: ensure user row exists with ZERO operational access
    if (existingUser) {
      await tx
        .update(users)
        .set({
          clerkUserId,
          fullName,
          email: normalizedEmail,
          phoneE164,
          role: null,
          facilityId: null,
          active: false,
          receivesPickupOtp: false,
        })
        .where(eq(users.id, existingUser.id));
    } else {
      await tx
        .insert(users)
        .values({
          clerkUserId,
          fullName,
          email: normalizedEmail,
          phoneE164,
          phoneVerified: false,
          role: null,
          facilityId: null,
          active: false,
          receivesPickupOtp: false,
        })
        .onConflictDoNothing();
    }

    await writeAudit(tx, {
      actor: null,
      action: "onboarding.requested",
      entityType: "user",
      entityId: onboardingId,
      before: null,
      after: {
        clerkUserId,
        requestedRole: data.requestedRole,
        facilityId: data.facilityId,
        facilityName: data.facilityName,
        status: "PENDING_REVIEW",
      },
      requestId,
    });

    return { id: onboardingId, status: "PENDING_REVIEW" };
  });
}

/**
 * Path B: Super Admin directly provisions / invites an account with a role and facility.
 */
export async function provisionUserDirectly(raw: unknown, requestId?: string) {
  const admin = await requireRole("super_admin");
  const parsed = provisionUserSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  const data = parsed.data;

  return inWorkflow(async (tx) => {
    let facilityId: string | null = null;
    if (data.facilityCode) {
      const [f] = await tx
        .select({ id: facilities.id })
        .from(facilities)
        .where(eq(facilities.code, data.facilityCode))
        .limit(1);
      if (!f) {
        throw new AppError("VALIDATION_ERROR", 422, "Unknown facility.", {
          fields: { facilityCode: ["Unknown facility"] },
        });
      }
      facilityId = f.id;
    }

    // Enforce exactly one active hospital admin per facility
    if (data.role === "hospital_admin" && data.active && facilityId) {
      const [existingAdmin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.facilityId, facilityId),
            eq(users.role, "hospital_admin"),
            eq(users.active, true)
          )
        )
        .limit(1);
      if (existingAdmin) {
        throw new AppError(
          "HOSPITAL_ADMIN_EXISTS",
          409,
          "This hospital already has an active Hospital Administrator."
        );
      }
    }

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.clerkUserId, data.clerkUserId), eq(users.email, data.email)))
      .limit(1);

    let userId: string;
    const values = {
      clerkUserId: data.clerkUserId,
      fullName: data.fullName,
      email: data.email,
      phoneE164: data.phoneE164 || null,
      phoneVerified: data.phoneE164 !== null,
      role: data.role,
      facilityId,
      active: data.active,
      receivesPickupOtp: data.receivesPickupOtp,
    };

    if (existing) {
      await tx.update(users).set(values).where(eq(users.id, existing.id)).catch(friendlyDbError);
      userId = existing.id;
    } else {
      const [created] = await tx.insert(users).values(values).returning({ id: users.id });
      userId = created.id;
    }

    // If driver role, provision driver profile if missing
    if (data.role === "driver") {
      const [drv] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.userId, userId))
        .limit(1);
      if (!drv) {
        const [veh] = await tx.select({ id: vehicles.id }).from(vehicles).limit(1);
        await tx.insert(drivers).values({
          userId,
          licenseNo: `ETH-DRV-${userId.slice(0, 8).toUpperCase()}`,
          defaultVehicleId: veh?.id ?? null,
          status: "ON_DUTY",
        });
      }
    }

    await writeAudit(tx, {
      actor: { userId: admin.id, role: admin.role },
      action: "user.provisioned",
      entityType: "user",
      entityId: userId,
      before: null,
      after: {
        role: data.role,
        facilityId,
        active: data.active,
        receivesPickupOtp: data.receivesPickupOtp,
      },
      requestId,
    });

    return { id: userId, clerkUserId: data.clerkUserId, role: data.role };
  });
}

/**
 * Approval Hierarchy Service:
 * - Super Administrator approves: New hospitals, Hospital Administrators, Fleet Drivers, Disposal Operators, EFDA Officers.
 * - Hospital Administrator approves: Staff requests strictly for their own facility.
 */
export async function approveOnboardingRequest(onboardingId: string, requestId?: string) {
  if (!UUID.test(onboardingId)) throw new AppError("NOT_FOUND", 404, "Request not found.");
  const actor = await getCurrentUser();
  if (!actor || !actor.active || !actor.role) throw new AppError("UNAUTHENTICATED");
  const actorRole = actor.role;

  return inWorkflow(async (tx) => {
    const [req] = await tx
      .select()
      .from(onboardingRequests)
      .where(eq(onboardingRequests.id, onboardingId))
      .limit(1);
    if (!req) throw new AppError("NOT_FOUND", 404, "Onboarding request not found.");
    if (req.status !== "PENDING_REVIEW") {
      throw new AppError("INVALID_TRANSITION", 409, "This request is no longer pending review.");
    }

    // Approval Hierarchy Authorization:
    if (req.requestedRole === "hospital_staff") {
      // Must be verified strictly by Hospital Admin of the SAME facility (not Super Admin)
      if (actorRole !== "hospital_admin" || actor.facilityId !== req.facilityId) {
        throw new AppError(
          "FORBIDDEN",
          403,
          "Hospital staff requests must be verified and approved by the Hospital Administrator of their facility, not by the Super Administrator."
        );
      }
      // Hospital must be approved and active
      if (req.facilityId) {
        const [fac] = await tx
          .select({ status: facilities.status })
          .from(facilities)
          .where(eq(facilities.id, req.facilityId))
          .limit(1);
        if (!fac || fac.status !== "ACTIVE") {
          throw new AppError(
            "FORBIDDEN",
            403,
            "Cannot approve staff requests for an unapproved or inactive facility."
          );
        }
      }
    } else {
      // All other roles (hospital_admin, driver, disposal_operator, efda_officer) REQUIRE Super Admin
      if (actorRole !== "super_admin") {
        throw new AppError(
          "FORBIDDEN",
          403,
          "Only Super Administrators can approve facilities, administrators, drivers, disposal operators, and EFDA officers."
        );
      }
    }

    let targetFacilityId = req.facilityId;

    // If new hospital request, create the facility now
    if (req.requestedRole === "hospital_admin" && !targetFacilityId) {
      if (!req.facilityName || !req.facilityType || !req.facilityAddress) {
        throw new AppError("VALIDATION_ERROR", 422, "Incomplete facility details in request.");
      }
      const code = await nextFacilityCode(tx, req.facilityType);
      const [newFac] = await tx
        .insert(facilities)
        .values({
          code,
          name: req.facilityName,
          type: req.facilityType,
          region: req.facilityRegion || "Dire Dawa",
          city: req.facilityCity || "Dire Dawa",
          address: req.facilityAddress,
          lat: req.facilityLat ?? 9.5931,
          lng: req.facilityLng ?? 41.8662,
          status: "ACTIVE",
        })
        .returning({ id: facilities.id });
      targetFacilityId = newFac.id;
      await writeAudit(tx, {
        actor: { userId: actor.id, role: actorRole },
        action: "facility.created",
        entityType: "facility",
        entityId: newFac.id,
        before: null,
        after: { code, name: req.facilityName, type: req.facilityType },
        requestId,
      });
    }

    // If disposal operator, bind to DISPOSAL_SITE
    if (req.requestedRole === "disposal_operator" && !targetFacilityId) {
      const [site] = await tx
        .select({ id: facilities.id })
        .from(facilities)
        .where(eq(facilities.type, "DISPOSAL_SITE"))
        .limit(1);
      if (!site) throw new AppError("NOT_FOUND", 404, "Disposal site facility not found.");
      targetFacilityId = site.id;
    }

    // Enforce exactly one active hospital admin per facility
    if (req.requestedRole === "hospital_admin" && targetFacilityId) {
      const [existingAdmin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.facilityId, targetFacilityId),
            eq(users.role, "hospital_admin"),
            eq(users.active, true)
          )
        )
        .limit(1);
      if (existingAdmin) {
        throw new AppError(
          "HOSPITAL_ADMIN_EXISTS",
          409,
          "This hospital already has an active Hospital Administrator."
        );
      }
    }

    // Provision or update user profile with role and active access
    const isHospital =
      req.requestedRole === "hospital_admin" || req.requestedRole === "hospital_staff";
    const receivesOtp = isHospital && req.phoneE164 !== null;

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.clerkUserId, req.clerkUserId), eq(users.email, req.email)))
      .limit(1);

    let assignedUserId: string;
    const userValues = {
      clerkUserId: req.clerkUserId,
      fullName: req.fullName,
      email: req.email,
      phoneE164: req.phoneE164,
      phoneVerified: req.phoneE164 !== null,
      role: req.requestedRole,
      facilityId: targetFacilityId,
      active: true,
      receivesPickupOtp: receivesOtp,
    };

    if (existingUser) {
      await tx
        .update(users)
        .set(userValues)
        .where(eq(users.id, existingUser.id))
        .catch(friendlyDbError);
      assignedUserId = existingUser.id;
    } else {
      const [newUser] = await tx
        .insert(users)
        .values(userValues)
        .returning({ id: users.id })
        .catch(friendlyDbError);
      assignedUserId = newUser.id;
    }

    // If driver, create driver profile record
    if (req.requestedRole === "driver") {
      const [drv] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.userId, assignedUserId))
        .limit(1);
      if (!drv) {
        const [veh] = await tx.select({ id: vehicles.id }).from(vehicles).limit(1);
        await tx.insert(drivers).values({
          userId: assignedUserId,
          licenseNo: `ETH-DRV-${assignedUserId.slice(0, 8).toUpperCase()}`,
          defaultVehicleId: veh?.id ?? null,
          status: "ON_DUTY",
        });
      }
    }

    // Mark request as APPROVED
    await tx
      .update(onboardingRequests)
      .set({
        status: "APPROVED",
        facilityId: targetFacilityId,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingRequests.id, req.id));

    await writeAudit(tx, {
      actor: { userId: actor.id, role: actorRole },
      action: "onboarding.approved",
      entityType: "user",
      entityId: assignedUserId,
      before: { status: "PENDING_REVIEW" },
      after: {
        status: "APPROVED",
        role: req.requestedRole,
        facilityId: targetFacilityId,
        active: true,
      },
      requestId,
    });

    return { id: req.id, status: "APPROVED", userId: assignedUserId };
  });
}

/**
 * Rejects an onboarding request with an audited reason.
 */
export async function rejectOnboardingRequest(
  onboardingId: string,
  raw: unknown,
  requestId?: string
) {
  if (!UUID.test(onboardingId)) throw new AppError("NOT_FOUND", 404, "Request not found.");
  const actor = await getCurrentUser();
  if (!actor || !actor.active || !actor.role) throw new AppError("UNAUTHENTICATED");
  const actorRole = actor.role;
  const parsed = rejectRequestSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);

  return inWorkflow(async (tx) => {
    const [req] = await tx
      .select()
      .from(onboardingRequests)
      .where(eq(onboardingRequests.id, onboardingId))
      .limit(1);
    if (!req) throw new AppError("NOT_FOUND", 404, "Onboarding request not found.");
    if (req.status !== "PENDING_REVIEW") {
      throw new AppError("INVALID_TRANSITION", 409, "This request is no longer pending review.");
    }

    if (req.requestedRole === "hospital_staff") {
      if (actorRole !== "hospital_admin" || actor.facilityId !== req.facilityId) {
        throw new AppError(
          "FORBIDDEN",
          403,
          "Hospital staff requests must be reviewed and rejected strictly by the Hospital Administrator of their facility."
        );
      }
    } else {
      if (actorRole !== "super_admin") {
        throw new AppError(
          "FORBIDDEN",
          403,
          "Only Super Administrators can reject administrative requests."
        );
      }
    }

    await tx
      .update(onboardingRequests)
      .set({
        status: "REJECTED",
        rejectionReason: parsed.data.reason,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(onboardingRequests.id, req.id));

    await writeAudit(tx, {
      actor: { userId: actor.id, role: actorRole },
      action: "onboarding.rejected",
      entityType: "user",
      entityId: req.id,
      before: { status: "PENDING_REVIEW" },
      after: { status: "REJECTED", reason: parsed.data.reason },
      requestId,
    });

    return { id: req.id, status: "REJECTED" };
  });
}
