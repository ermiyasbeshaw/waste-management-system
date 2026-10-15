import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { getAuthUserId, requireRole } from "@/server/auth/current-user";
import { rows } from "./_shared";

export interface OnboardingRequestRow {
  id: string;
  clerkUserId: string;
  fullName: string;
  email: string;
  phoneE164: string | null;
  requestedRole: string;
  facility: { id: string; code: string; name: string } | null;
  newFacility: {
    name: string | null;
    type: string | null;
    region: string | null;
    city: string | null;
    address: string | null;
  } | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

type OnboardingDbRow = {
  id: string;
  clerk_user_id: string;
  full_name: string;
  email: string;
  phone_e164: string | null;
  requested_role: string;
  facility_id: string | null;
  facility_code: string | null;
  facility_name: string | null;
  new_facility_name: string | null;
  new_facility_type: string | null;
  new_facility_region: string | null;
  new_facility_city: string | null;
  new_facility_address: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  notes: string | null;
  rejection_reason: string | null;
  created_at: Date;
};

function toOnboardingRow(r: OnboardingDbRow): OnboardingRequestRow {
  return {
    id: r.id,
    clerkUserId: r.clerk_user_id,
    fullName: r.full_name,
    email: r.email,
    phoneE164: r.phone_e164,
    requestedRole: r.requested_role,
    facility:
      r.facility_id && r.facility_code && r.facility_name
        ? { id: r.facility_id, code: r.facility_code, name: r.facility_name }
        : null,
    newFacility: r.new_facility_name
      ? {
          name: r.new_facility_name,
          type: r.new_facility_type,
          region: r.new_facility_region,
          city: r.new_facility_city,
          address: r.new_facility_address,
        }
      : null,
    status: r.status,
    notes: r.notes,
    rejectionReason: r.rejection_reason,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Current user's own onboarding request, if any. */
export const getMyOnboardingRequest = cache(async (): Promise<OnboardingRequestRow | null> => {
  const clerkUserId = await getAuthUserId();
  if (!clerkUserId) return null;

  const result = await rows<OnboardingDbRow>(sql`
    SELECT r.id, r.clerk_user_id, r.full_name, r.email, r.phone_e164, r.requested_role,
           r.facility_id, f.code AS facility_code, f.name AS facility_name,
           r.facility_name AS new_facility_name, r.facility_type AS new_facility_type,
           r.facility_region AS new_facility_region, r.facility_city AS new_facility_city,
           r.facility_address AS new_facility_address,
           r.status, r.notes, r.rejection_reason, r.created_at
    FROM onboarding_requests r
    LEFT JOIN facilities f ON f.id = r.facility_id
    WHERE r.clerk_user_id = ${clerkUserId}
    ORDER BY r.created_at DESC
    LIMIT 1
  `);

  return result[0] ? toOnboardingRow(result[0]) : null;
});

/** Pending requests for Super Administrator oversight. */
export const getPendingOnboardingRequestsForAdmin = cache(
  async (): Promise<OnboardingRequestRow[]> => {
    await requireRole("super_admin");

    const result = await rows<OnboardingDbRow>(sql`
      SELECT r.id, r.clerk_user_id, r.full_name, r.email, r.phone_e164, r.requested_role,
             r.facility_id, f.code AS facility_code, f.name AS facility_name,
             r.facility_name AS new_facility_name, r.facility_type AS new_facility_type,
             r.facility_region AS new_facility_region, r.facility_city AS new_facility_city,
             r.facility_address AS new_facility_address,
             r.status, r.notes, r.rejection_reason, r.created_at
      FROM onboarding_requests r
      LEFT JOIN facilities f ON f.id = r.facility_id
      WHERE r.status = 'PENDING_REVIEW'
      ORDER BY r.created_at ASC
      LIMIT 100
    `);

    return result.map(toOnboardingRow);
  }
);

/** Pending staff requests for the current Hospital Administrator's facility. */
export const getPendingOnboardingRequestsForHospital = cache(
  async (): Promise<OnboardingRequestRow[]> => {
    const admin = await requireRole("hospital_admin");
    if (!admin.facilityId) return [];

    const result = await rows<OnboardingDbRow>(sql`
      SELECT r.id, r.clerk_user_id, r.full_name, r.email, r.phone_e164, r.requested_role,
             r.facility_id, f.code AS facility_code, f.name AS facility_name,
             r.facility_name AS new_facility_name, r.facility_type AS new_facility_type,
             r.facility_region AS new_facility_region, r.facility_city AS new_facility_city,
             r.facility_address AS new_facility_address,
             r.status, r.notes, r.rejection_reason, r.created_at
      FROM onboarding_requests r
      LEFT JOIN facilities f ON f.id = r.facility_id
      WHERE r.status = 'PENDING_REVIEW'
        AND r.facility_id = ${admin.facilityId}
        AND r.requested_role = 'hospital_staff'
      ORDER BY r.created_at ASC
      LIMIT 100
    `);

    return result.map(toOnboardingRow);
  }
);

/** Active facilities for the applicant onboarding dropdown. */
export const getActiveFacilitiesForOnboarding = cache(
  async (): Promise<{ id: string; code: string; name: string; type: string }[]> => {
    return rows<{ id: string; code: string; name: string; type: string }>(sql`
      SELECT id, code, name, type
      FROM facilities
      WHERE status = 'ACTIVE' AND type != 'DISPOSAL_SITE'
      ORDER BY name ASC
      LIMIT 200
    `);
  }
);
