import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { facilityType, userRole } from "./enums";
import { facilities } from "./facilities";
import { users } from "./users";

export const onboardingRequestStatus = pgEnum("onboarding_request_status", [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);

/**
 * Onboarding Requests (Dual-Path Onboarding):
 * Path A: Self-request initiated by a user or organization.
 * Starts in PENDING_REVIEW status with zero operational access until approved.
 * Super Admin approves new hospitals, hospital admins, drivers, disposal operators, and EFDA officers.
 * Hospital Admin approves staff requests for their own facility.
 */
export const onboardingRequests = pgTable(
  "onboarding_requests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    clerkUserId: text("clerk_user_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phoneE164: text("phone_e164"),
    requestedRole: userRole("requested_role").notNull(),

    // If joining an existing facility
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "restrict" }),

    // If requesting a NEW hospital facility
    facilityName: text("facility_name"),
    facilityType: facilityType("facility_type"),
    facilityRegion: text("facility_region"),
    facilityCity: text("facility_city"),
    facilityAddress: text("facility_address"),
    facilityLat: doublePrecision("facility_lat"),
    facilityLng: doublePrecision("facility_lng"),

    status: onboardingRequestStatus("status").notNull().default("PENDING_REVIEW"),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),

    // Approval tracking
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("onboarding_requests_status_idx").on(t.status),
    index("onboarding_requests_facility_idx").on(t.facilityId),
    index("onboarding_requests_clerk_user_idx").on(t.clerkUserId),
  ]
);

export type OnboardingRequest = typeof onboardingRequests.$inferSelect;
export type NewOnboardingRequest = typeof onboardingRequests.$inferInsert;
