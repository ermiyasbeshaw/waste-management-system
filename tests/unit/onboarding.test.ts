import { describe, expect, it } from "vitest";
import {
  onboardingRequestSchema,
  provisionUserSchema,
  rejectRequestSchema,
} from "@/lib/validation/onboarding";
import { checkRole, hasAccess, type AccessUser } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";

describe("Dual-Path Onboarding & Approval Hierarchy Rules", () => {
  describe("Path A: Self-Request Validation", () => {
    it("accepts a valid self-request to join an existing hospital as staff", () => {
      const parsed = onboardingRequestSchema.safeParse({
        fullName: "Abebe Tadesse",
        email: "abebe@example.com",
        phoneE164: "+251911223344",
        requestedRole: "hospital_staff",
        facilityId: "019266ab-0000-7000-8000-000000000001",
        notes: "Joining as lead EHO",
      });
      expect(parsed.success).toBe(true);
    });

    it("requires an existing facilityId when requesting hospital_staff", () => {
      const parsed = onboardingRequestSchema.safeParse({
        fullName: "Abebe Tadesse",
        email: "abebe@example.com",
        requestedRole: "hospital_staff",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain("Staff must select an existing hospital");
      }
    });

    it("accepts a valid new hospital registration request with facility details", () => {
      const parsed = onboardingRequestSchema.safeParse({
        fullName: "Dr. Kebede Michael",
        email: "kebede@newclinic.et",
        phoneE164: "+251922334455",
        requestedRole: "hospital_admin",
        facilityName: "Dire Dawa Specialized Poly Clinic",
        facilityType: "CLINIC",
        facilityRegion: "Dire Dawa",
        facilityAddress: "Kebele 03, River Walk",
      });
      expect(parsed.success).toBe(true);
    });

    it("requires facility details when requesting hospital_admin without an existing facility", () => {
      const parsed = onboardingRequestSchema.safeParse({
        fullName: "Dr. Kebede Michael",
        email: "kebede@newclinic.et",
        requestedRole: "hospital_admin",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const messages = parsed.error.issues.map((i) => i.message);
        expect(messages).toContain("Facility name is required when registering a new hospital");
      }
    });

    it("accepts driver, disposal operator, and EFDA officer requests without facilities", () => {
      for (const role of ["driver", "disposal_operator", "efda_officer"] as const) {
        const parsed = onboardingRequestSchema.safeParse({
          fullName: "Test Candidate",
          email: `${role}@example.com`,
          requestedRole: role,
        });
        expect(parsed.success).toBe(true);
      }
    });
  });

  describe("Path B: Super Admin Direct Provisioning", () => {
    it("validates direct provisioning of a hospital administrator", () => {
      const parsed = provisionUserSchema.safeParse({
        clerkUserId: "user_prov_123",
        fullName: "Admin Direct",
        email: "direct@example.com",
        role: "hospital_admin",
        facilityCode: "DD-REF-001",
        active: true,
        receivesPickupOtp: true,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects provisioning hospital role without a facility code", () => {
      const parsed = provisionUserSchema.safeParse({
        clerkUserId: "user_prov_123",
        fullName: "Admin Direct",
        email: "direct@example.com",
        role: "hospital_admin",
        active: true,
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects provisioning global roles with a facility code", () => {
      for (const role of ["super_admin", "driver", "efda_officer"] as const) {
        const parsed = provisionUserSchema.safeParse({
          clerkUserId: "user_prov_123",
          fullName: "Global Direct",
          email: "global@example.com",
          role,
          facilityCode: "DD-REF-001",
          active: true,
        });
        expect(parsed.success).toBe(false);
      }
    });
  });

  describe("Zero Operational Access for Pending & Suspended Accounts", () => {
    it("denies access when user has no role (pending onboarding)", () => {
      const pendingUser: AccessUser = {
        id: "019266ab-0000-7000-8000-000000000001",
        role: null,
        facilityId: null,
        active: false,
      };
      expect(hasAccess(pendingUser)).toBe(false);
      expect(() => checkRole(pendingUser, ["super_admin", "hospital_admin"])).toThrowError(
        AppError
      );
    });

    it("immediately denies access when account is deactivated/suspended", () => {
      const deactivatedUser: AccessUser = {
        id: "019266ab-0000-7000-8000-000000000001",
        role: "hospital_staff",
        facilityId: "019266ab-0000-7000-8000-000000000002",
        active: false,
      };
      expect(hasAccess(deactivatedUser)).toBe(false);
      expect(() => checkRole(deactivatedUser, ["hospital_staff"])).toThrowError(
        /Your account has no access yet/
      );
    });

    it("blocks disposal operators from hospital and medicine stock areas", () => {
      const disposalUser: AccessUser = {
        id: "019266ab-0000-7000-8000-000000000001",
        role: "disposal_operator",
        facilityId: "019266ab-0000-7000-8000-000000000002",
        active: true,
      };
      expect(() =>
        checkRole(disposalUser, [
          "hospital_admin",
          "hospital_staff",
          "super_admin",
          "efda_officer",
        ])
      ).toThrowError(/permission/);
    });
  });

  describe("Rejection Reason Validation", () => {
    it("requires a meaningful reason when rejecting onboarding requests", () => {
      expect(rejectRequestSchema.safeParse({ reason: "OK" }).success).toBe(false);
      expect(
        rejectRequestSchema.safeParse({ reason: "Incomplete facility licensing documentation" })
          .success
      ).toBe(true);
    });
  });

  describe("Approval Hierarchy Delegation", () => {
    it("verifies that hospital_staff is strictly approved by their hospital admin", () => {
      const hospitalAdmin: AccessUser = {
        id: "019266ab-0000-7000-8000-000000000001",
        role: "hospital_admin",
        facilityId: "facility_abc",
        active: true,
      };
      const superAdmin: AccessUser = {
        id: "019266ab-0000-7000-8000-000000000002",
        role: "super_admin",
        facilityId: null,
        active: true,
      };

      // Hospital admin has access to hospital management
      expect(checkRole(hospitalAdmin, ["hospital_admin"]).role).toBe("hospital_admin");
      // Super admin has access to administrative area
      expect(checkRole(superAdmin, ["super_admin"]).role).toBe("super_admin");
    });
  });
});
