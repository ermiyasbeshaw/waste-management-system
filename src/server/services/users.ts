import "server-only";
import { sql } from "drizzle-orm";
import { maskPhone } from "@/lib/redact";
import { writeAudit } from "@/server/audit/writer";
import type { ClerkUserEvent } from "@/server/auth/clerk-webhook";
import { inWorkflow } from "@/server/workflow/engine";

/**
 * Clerk → users sync (CLAUDE.md §4, Gate 1b.8). Clerk is the only place a phone gets verified; this copies the
 * primary email, the primary phone and its verification onto the user's row. Roles and facilities are never taken
 * from Clerk. Staff accounts are invitation-only: a Clerk user without a `users` row is ignored (they see /pending
 * until an administrator assigns a role). A phone that is no longer verified stops receiving pickup codes.
 */
export async function syncClerkUser(
  evt: ClerkUserEvent,
  requestId?: string
): Promise<{ result: "created" | "updated" | "deactivated" | "unknown_user" }> {
  return inWorkflow(async (tx) => {
    const email = (evt.email ?? `${evt.clerkUserId}@placeholder.internal`).toLowerCase();
    const row = (
      await tx.execute(
        sql`SELECT id, email, phone_e164, phone_verified, receives_pickup_otp, active
            FROM users WHERE clerk_user_id = ${evt.clerkUserId} OR email = ${email} FOR UPDATE`
      )
    ).rows[0] as
      | {
          id: string;
          email: string;
          phone_e164: string | null;
          phone_verified: boolean;
          receives_pickup_otp: boolean;
          active: boolean;
        }
      | undefined;

    if (!row) {
      if (evt.type === "user.deleted") return { result: "unknown_user" as const };

      // Fail-closed initialization: create user with role=null and active=false (zero operational access).
      const fullName = evt.fullName?.trim() || "New User";
      const phoneVerified = evt.phoneE164 !== null && evt.phoneVerified;
      const inserted = (
        await tx.execute(
          sql`INSERT INTO users (clerk_user_id, full_name, email, phone_e164, phone_verified, role, facility_id, active, receives_pickup_otp)
              VALUES (${evt.clerkUserId}, ${fullName}, ${email}, ${evt.phoneE164}, ${phoneVerified}, NULL, NULL, false, false)
              ON CONFLICT (clerk_user_id) DO NOTHING
              RETURNING id`
        )
      ).rows[0] as { id: string } | undefined;

      if (inserted) {
        await writeAudit(tx, {
          actor: null,
          action: "user.clerk_created",
          entityType: "user",
          entityId: inserted.id,
          before: null,
          after: { clerkUserId: evt.clerkUserId, email, active: false, role: null },
          requestId,
        });
        return { result: "created" as const };
      }
      return { result: "updated" as const };
    }

    if (evt.type === "user.deleted") {
      await tx.execute(
        sql`UPDATE users SET active = false, receives_pickup_otp = false WHERE id = ${row.id}`
      );
      await writeAudit(tx, {
        actor: null,
        action: "user.clerk_deleted",
        entityType: "user",
        entityId: row.id,
        before: { active: row.active },
        after: { active: false },
        requestId,
      });
      return { result: "deactivated" as const };
    }

    const phoneVerified = evt.phoneE164 !== null && evt.phoneVerified;
    const receives = row.receives_pickup_otp && phoneVerified;
    await tx.execute(
      sql`UPDATE users SET clerk_user_id = ${evt.clerkUserId}, email = ${email}, phone_e164 = ${evt.phoneE164}, phone_verified = ${phoneVerified},
                           receives_pickup_otp = ${receives}
          WHERE id = ${row.id}`
    );
    await writeAudit(tx, {
      actor: null,
      action: "user.clerk_synced",
      entityType: "user",
      entityId: row.id,
      before: {
        phone: row.phone_e164 ? maskPhone(row.phone_e164) : null,
        phoneVerified: row.phone_verified,
        receivesPickupOtp: row.receives_pickup_otp,
        emailChanged: false,
      },
      after: {
        phone: evt.phoneE164 ? maskPhone(evt.phoneE164) : null,
        phoneVerified,
        receivesPickupOtp: receives,
        emailChanged: email !== row.email,
      },
      requestId,
    });
    return { result: "updated" as const };
  });
}
