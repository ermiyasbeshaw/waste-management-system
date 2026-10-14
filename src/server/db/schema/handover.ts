import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps, tsz } from "./_common";
import { handoverStatus, otpStatus } from "./enums";
import { drivers } from "./fleet";
import { tripStops } from "./trips";
import { containers } from "./waste";

/**
 * Pickup OTPs (CLAUDE.md §6): only a hash is stored, single use, limited attempts. At most ONE active (ISSUED)
 * code per stop; skip / cancel / reassignment set CANCELLED.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    tripStopId: uuid("trip_stop_id")
      .notNull()
      .references(() => tripStops.id, { onDelete: "restrict" }),
    codeHash: text("code_hash").notNull(),
    recipientCount: integer("recipient_count").notNull(),
    expiresAt: tsz("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    status: otpStatus("status").notNull().default("ISSUED"),
    verifiedAt: tsz("verified_at"),
    cancelledAt: tsz("cancelled_at"),
    ...timestamps,
  },
  (t) => [
    index("otp_codes_trip_stop_idx").on(t.tripStopId),
    uniqueIndex("otp_codes_one_issued_per_stop")
      .on(t.tripStopId)
      .where(sql`${t.status} = 'ISSUED'`),
    check("otp_codes_hash_filled", sql`length(${t.codeHash}) >= 32`),
    check("otp_codes_recipients_min", sql`${t.recipientCount} >= 1`),
    check("otp_codes_attempts_min", sql`${t.attempts} >= 0`),
    check("otp_codes_verified_at", sql`(${t.status} = 'VERIFIED') = (${t.verifiedAt} IS NOT NULL)`),
    check(
      "otp_codes_cancelled_at",
      sql`(${t.status} = 'CANCELLED') = (${t.cancelledAt} IS NOT NULL)`
    ),
  ]
);

/**
 * Container scans at pickup = evidence, not collection (CLAUDE.md §6: NO PARTIAL PICKUP). One scan per
 * container per stop. CANCELLED rows are kept for audit when a stop is skipped.
 */
export const handovers = pgTable(
  "handovers",
  {
    id: id(),
    tripStopId: uuid("trip_stop_id")
      .notNull()
      .references(() => tripStops.id, { onDelete: "restrict" }),
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.id, { onDelete: "restrict" }),
    otpId: uuid("otp_id").references(() => otpCodes.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "restrict" }),
    scannedAt: tsz("scanned_at").notNull().defaultNow(),
    status: handoverStatus("status").notNull().default("SCANNED"),
    idempotencyKey: text("idempotency_key"),
    ...timestamps,
  },
  (t) => [unique("handovers_stop_container_unique").on(t.tripStopId, t.containerId)]
);
