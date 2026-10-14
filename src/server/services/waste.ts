import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { containerCode } from "@/lib/codes";
import { EFDA_APPROVAL_CATEGORIES, registerWasteSchema } from "@/lib/validation/waste";
import { reasonSchema } from "@/lib/validation/trip";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import { requireRole } from "@/server/auth/current-user";
import { nextCode } from "@/server/db/codes";
import type { DbExecutor } from "@/server/db/executor";
import { containers, facilities, wasteCategories, wasteRecords } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency/store";
import { inWorkflow, transition } from "@/server/workflow/engine";
import { invalid } from "./_errors";

/**
 * Waste registration (CLAUDE.md §6, architecture §8.1). Request pipeline (§14.3): authenticate → DB role and
 * facility scope → zod → idempotency → this service → one transaction (waste record REGISTERED + every container
 * LABELLED + audit row) → commit. The facility is always the signed-in user's own — never taken from the input.
 */

/** What the form shows after a successful registration (also the stored idempotent response). */
export type RegisteredWaste = {
  id: string;
  wasteCode: string;
  containerCount: number;
  containerCodes: string[];
};

export const REGISTER_WASTE_ROUTE = "action:registerWaste";

/** Entry point for the Server Action: role check first, then validation, idempotency and the transaction. */
export async function registerWaste(
  rawInput: unknown,
  meta: { idempotencyKey: string | null | undefined; requestId?: string }
): Promise<RegisteredWaste> {
  const user = await requireRole("hospital_admin", "hospital_staff");
  return inWorkflow(async (tx) => {
    const result = await withIdempotency(
      tx,
      { key: meta.idempotencyKey, userId: user.id, route: REGISTER_WASTE_ROUTE, request: rawInput },
      async () => ({ status: 201, body: await registerWasteTx(tx, user, rawInput, meta.requestId) })
    );
    return result.body;
  });
}

/** The transaction body (exported for integration tests, which run it inside a rolled-back transaction). */
export async function registerWasteTx(
  tx: DbExecutor,
  user: ActiveUser,
  rawInput: unknown,
  requestId?: string,
  opts: { viaApprovedRequest?: boolean } = {}
): Promise<RegisteredWaste> {
  if (user.role !== "hospital_admin" && user.role !== "hospital_staff") {
    throw new AppError("FORBIDDEN", 403);
  }
  if (!user.facilityId) {
    throw new AppError("FORBIDDEN", 403, "Your account is not linked to a facility.");
  }
  const parsed = registerWasteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", 422, "Please correct the highlighted fields.", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const input = parsed.data;
  // Medicine needs EFDA approval (CLAUDE.md §12): only an approved disposal request may register it.
  if (EFDA_APPROVAL_CATEGORIES.includes(input.categoryCode) && !opts.viaApprovedRequest) {
    throw new AppError(
      "NEEDS_EFDA_APPROVAL",
      409,
      "Medicine waste needs EFDA approval. Use Medicine Stock → Disposal requests instead."
    );
  }

  const [facility] = await tx
    .select({ type: facilities.type, status: facilities.status })
    .from(facilities)
    .where(eq(facilities.id, user.facilityId))
    .limit(1);
  if (!facility || facility.type === "DISPOSAL_SITE") {
    throw new AppError("FORBIDDEN", 403, "Waste can only be registered by a health facility.");
  }
  if (facility.status !== "ACTIVE") {
    throw new AppError(
      "FACILITY_NOT_ACTIVE",
      409,
      "This facility is not active; registration is closed."
    );
  }

  const [category] = await tx
    .select({ id: wasteCategories.id, name: wasteCategories.name })
    .from(wasteCategories)
    .where(and(eq(wasteCategories.code, input.categoryCode), eq(wasteCategories.active, true)))
    .limit(1);
  if (!category) {
    throw new AppError("VALIDATION_ERROR", 422, "Please correct the highlighted fields.", {
      fields: { categoryCode: ["This category does not exist or is no longer used"] },
    });
  }

  const wasteCode = await nextCode(tx, "waste");
  const [waste] = await tx
    .insert(wasteRecords)
    .values({
      wasteCode,
      facilityId: user.facilityId,
      categoryId: category.id,
      containerCount: input.containerCount,
      weightKg: input.weightKg.toFixed(2),
      registeredBy: user.id,
    })
    .returning({ id: wasteRecords.id });

  const containerCodes = Array.from({ length: input.containerCount }, (_, i) =>
    containerCode(wasteCode, i + 1)
  );
  await tx.insert(containers).values(
    containerCodes.map((code, i) => ({
      containerCode: code,
      wasteRecordId: waste.id,
      seqNo: i + 1,
    }))
  );

  await writeAudit(tx, {
    actor: { userId: user.id, role: user.role },
    action: "waste.registered",
    entityType: "waste_record",
    entityId: waste.id,
    after: {
      wasteCode,
      status: "REGISTERED",
      category: input.categoryCode,
      containerCount: input.containerCount,
      weightKg: input.weightKg,
    },
    requestId: requestId ?? null,
  });

  return { id: waste.id, wasteCode, containerCount: input.containerCount, containerCodes };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancel a registration (CLAUDE.md §5): REGISTERED / SCHEDULED → CANCELLED with a reason, by the facility's hospital
 * users (own facility, checked by the Workflow Engine) or super_admin. Never once a container is collected, and
 * blocked (409) while the truck is at the door (stop ARRIVED) — the driver skips the stop instead. A SCHEDULED record
 * leaves its planned stop.
 * ASSUMPTION: if it is the ONLY waste on its planned stop, cancelling is refused (409) until the Super Administrator
 * skips that stop — an empty stop must not stay on the trip, and only the driver or super_admin may skip a stop.
 */
export async function cancelWaste(wasteId: string, raw: unknown, requestId?: string) {
  const user = await requireRole("hospital_admin", "hospital_staff", "super_admin");
  const parsed = reasonSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error);
  if (!UUID.test(wasteId)) throw new AppError("NOT_FOUND", 404, "Waste record not found.");
  return inWorkflow(async (tx) => {
    const w = (
      await tx.execute(
        sql`SELECT id, waste_code, status, facility_id FROM waste_records WHERE id = ${wasteId} FOR UPDATE`
      )
    ).rows[0] as
      { id: string; waste_code: string; status: string; facility_id: string } | undefined;
    // Another facility's record is "not found" for hospital users (no existence leak).
    if (!w || (user.role !== "super_admin" && w.facility_id !== user.facilityId)) {
      throw new AppError("NOT_FOUND", 404, "Waste record not found.");
    }
    if (w.status === "SCHEDULED") {
      const link = (
        await tx.execute(
          sql`SELECT l.trip_stop_id, s.status AS stop_status,
                     (SELECT count(*) FROM trip_stop_waste o
                       WHERE o.trip_stop_id = l.trip_stop_id AND o.active AND o.waste_record_id <> l.waste_record_id)::int AS others
              FROM trip_stop_waste l JOIN trip_stops s ON s.id = l.trip_stop_id
              WHERE l.waste_record_id = ${wasteId} AND l.active FOR UPDATE OF l, s`
        )
      ).rows[0] as { trip_stop_id: string; stop_status: string; others: number } | undefined;
      if (link?.stop_status === "ARRIVED") {
        throw new AppError(
          "STOP_ARRIVED",
          409,
          "The truck is at the door for this waste. The driver skips the stop instead."
        );
      }
      if (link && link.others === 0) {
        throw new AppError(
          "LAST_WASTE_ON_STOP",
          409,
          "This is the only waste on a planned pickup stop. Ask the Super Administrator to skip that stop first; the waste then returns to the waiting list and can be cancelled."
        );
      }
      if (link) {
        await tx.execute(
          sql`UPDATE trip_stop_waste SET active = false
              WHERE trip_stop_id = ${link.trip_stop_id} AND waste_record_id = ${wasteId}`
        );
      }
    }
    await transition(tx, {
      entity: "waste",
      id: wasteId,
      to: "CANCELLED",
      actor: user,
      reason: parsed.data.reason,
      requestId,
    });
    return { wasteCode: w.waste_code, status: "CANCELLED" };
  });
}
