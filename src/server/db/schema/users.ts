import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRole } from "./enums";
import { facilities } from "./facilities";

/**
 * Users (architecture §6.2, CLAUDE.md §4). The database — not Clerk metadata — is the source of truth for
 * role, facility and active state. Phone and verification are synced from Clerk by webhook (Gate 1b.8).
 * A row without a role is a signed-in person waiting for access (/pending).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: userRole("role"),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phoneE164: text("phone_e164"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    receivesPickupOtp: boolean("receives_pickup_otp").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // facility_id: required for hospital roles and disposal_operator, forbidden for the others and when no role.
    check(
      "users_facility_by_role",
      // `role IS NOT NULL` is explicit: a NULL role would make IN (...) unknown, and CHECK accepts unknown.
      sql`(${t.role} IS NULL AND ${t.facilityId} IS NULL)
       OR (${t.role} IS NOT NULL AND ${t.role} IN ('hospital_admin', 'hospital_staff', 'disposal_operator') AND ${t.facilityId} IS NOT NULL)
       OR (${t.role} IS NOT NULL AND ${t.role} IN ('super_admin', 'driver', 'efda_officer') AND ${t.facilityId} IS NULL)`
    ),
    // Only hospital users can receive pickup OTPs, and only with a verified phone.
    check(
      "users_otp_recipient_rules",
      sql`NOT ${t.receivesPickupOtp}
       OR (${t.role} IS NOT NULL AND ${t.role} IN ('hospital_admin', 'hospital_staff') AND ${t.phoneVerified} AND ${t.phoneE164} IS NOT NULL)`
    ),
    check(
      "users_phone_e164_format",
      sql`${t.phoneE164} IS NULL OR ${t.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`
    ),
    check(
      "users_phone_verified_needs_phone",
      sql`NOT ${t.phoneVerified} OR ${t.phoneE164} IS NOT NULL`
    ),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_one_active_hospital_admin_idx")
      .on(t.facilityId)
      .where(sql`${t.role} = 'hospital_admin' AND ${t.active} = true`),
    index("users_facility_role_idx").on(t.facilityId, t.role),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
