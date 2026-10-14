import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { writeAudit } from "@/server/audit/writer";
import type { ActiveUser } from "@/server/auth/access-rules";
import type { DbExecutor } from "@/server/db/executor";
import { otpCodes } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { getSetting } from "@/server/services/settings";

/**
 * Pickup OTPs (CLAUDE.md §6): 6 digits from a secure RNG, stored only as an HMAC (keyed, bound to the stop),
 * compared in constant time, single use; expiry and attempts from settings. One SMS per recipient (the stop
 * facility's active hospital users with a verified phone who receive pickup OTPs) through the outbox.
 * No email OTP. Codes are never logged, audited or returned by any API.
 */

/** HMAC key, derived from OUTBOX_ENCRYPTION_KEY with a separate label (no second secret to manage). */
function otpKey(): Buffer {
  return createHmac("sha256", Buffer.from(env.OUTBOX_ENCRYPTION_KEY, "hex"))
    .update("safewaste-otp-v1")
    .digest();
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code: string, stopId: string, key: Buffer = otpKey()): string {
  return createHmac("sha256", key).update(`${stopId}:${code}`).digest("hex");
}

/** Constant-time comparison of a typed code with the stored hash. */
export function otpMatches(
  code: string,
  stopId: string,
  storedHash: string,
  key: Buffer = otpKey()
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hashOtp(code, stopId, key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cancels every ISSUED OTP of a stop (skip, cancel, reassignment, in-app, override). */
export async function cancelActiveOtps(tx: DbExecutor, stopId: string): Promise<number> {
  const rows = await tx
    .update(otpCodes)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(and(eq(otpCodes.tripStopId, stopId), eq(otpCodes.status, "ISSUED")))
    .returning({ id: otpCodes.id });
  return rows.length;
}

export interface IssuedOtp {
  issued: boolean;
  recipientCount: number;
  expiresAt: Date | null;
  /** Only for the caller inside the server (tests); never sent to a client. */
  code: string | null;
}

/**
 * Issues a new OTP for an ARRIVED stop: limits per stop, cancels the previous one, writes the hash, one SMS per
 * recipient (outbox, same transaction) and an audit row without the code.
 */
export async function issueOtp(
  tx: DbExecutor,
  stop: { id: string; facilityId: string; facilityName: string },
  actor: ActiveUser,
  requestId?: string
): Promise<IssuedOtp> {
  const [expiryMinutes, maxPerStop] = await Promise.all([
    getSetting("otp_expiry_minutes", tx),
    getSetting("otp_max_per_stop", tx),
  ]);
  const [{ n }] = (
    await tx.execute(sql`SELECT count(*)::int AS n FROM otp_codes WHERE trip_stop_id = ${stop.id}`)
  ).rows as { n: number }[];
  if (n >= maxPerStop) {
    throw new AppError(
      "OTP_LIMIT_REACHED",
      409,
      "No more codes can be sent for this stop. Ask the hospital to confirm in the app, or the administrator to override."
    );
  }
  const recipients = (
    await tx.execute(sql`
      SELECT id, phone_e164 FROM users
      WHERE facility_id = ${stop.facilityId} AND active AND phone_verified AND receives_pickup_otp
        AND role IN ('hospital_admin', 'hospital_staff') AND phone_e164 IS NOT NULL
      ORDER BY id LIMIT 20`)
  ).rows as { id: string; phone_e164: string }[];
  if (recipients.length === 0) {
    return { issued: false, recipientCount: 0, expiresAt: null, code: null };
  }

  await cancelActiveOtps(tx, stop.id);
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);
  const [otp] = await tx
    .insert(otpCodes)
    .values({
      tripStopId: stop.id,
      codeHash: hashOtp(code, stop.id),
      recipientCount: recipients.length,
      expiresAt,
    })
    .returning({ id: otpCodes.id });
  for (const r of recipients) {
    await enqueueMessage(tx, {
      template: "otp.pickup",
      recipient: r.phone_e164,
      data: { facilityName: stop.facilityName, expiresInMinutes: expiryMinutes },
      secrets: { code },
      expiresAt,
    });
  }
  await writeAudit(tx, {
    actor: { userId: actor.id, role: actor.role },
    action: "otp.issued",
    entityType: "otp_code",
    entityId: otp.id,
    after: {
      stopId: stop.id,
      recipientCount: recipients.length,
      expiresAt: expiresAt.toISOString(),
      number: n + 1,
    },
    requestId,
  });
  return { issued: true, recipientCount: recipients.length, expiresAt, code };
}
