import "server-only";
import { AppError } from "@/server/errors";

/** Shared error translation for the admin services (input errors → 422, unique / check violations → 409 / 422). */

export function invalid(error: { flatten: () => { fieldErrors: unknown } }): AppError {
  return new AppError("VALIDATION_ERROR", 422, "Please correct the highlighted fields.", {
    fields: error.flatten().fieldErrors,
  });
}

/** Postgres unique / check violations → readable 409 / 422 instead of a 500. */
export function friendlyDbError(err: unknown): never {
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = e.code ?? e.cause?.code;
  const constraint = e.constraint ?? e.cause?.constraint ?? "";
  if (code === "23505") {
    throw new AppError("CONFLICT", 409, "This value is already used.", { constraint });
  }
  if (code === "23P01") {
    // Exclusion constraint, e.g. contracts_no_overlap (one contract per facility at a time).
    throw new AppError(
      "CONFLICT",
      409,
      constraint === "contracts_no_overlap"
        ? "This facility already has a contract in that period."
        : "This overlaps with an existing record.",
      { constraint }
    );
  }
  if (code === "23514") {
    const messages: Record<string, string> = {
      users_facility_by_role:
        "Hospital roles and disposal operators need a facility; other roles must not have one.",
      users_otp_recipient_rules:
        "Only hospital users with a verified phone can receive pickup codes.",
      users_facility_type_by_role:
        "Disposal operators belong to the disposal site; hospital roles to a health facility.",
      facilities_type_locked_with_users:
        "Users are linked to this facility; its type cannot change.",
      drivers_user_is_driver: "This user has a driver profile and must keep the driver role.",
    };
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      messages[constraint] ?? "This change breaks a data rule.",
      {
        constraint,
      }
    );
  }
  throw err;
}
