import { z } from "zod";

const E164 = /^\+[1-9]\d{7,14}$/;

export const onboardingRequestSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
    email: z.string().trim().email("Valid email required").toLowerCase(),
    phoneE164: z
      .string()
      .trim()
      .regex(E164, "Phone must be in E.164 format (+251...)")
      .optional()
      .nullable()
      .or(z.literal("")),
    requestedRole: z.enum([
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
      "efda_officer",
    ]),
    facilityId: z.string().uuid("Invalid facility ID").optional().nullable().or(z.literal("")),
    notes: z.string().trim().max(500).optional().nullable().or(z.literal("")),

    // New facility registration fields (for new hospital requests)
    facilityName: z.string().trim().min(3, "Facility name required").optional().or(z.literal("")),
    facilityType: z
      .enum(["REFERRAL_HOSPITAL", "GENERAL_HOSPITAL", "PRIMARY_HOSPITAL", "CLINIC", "PHARMACY"])
      .optional(),
    facilityRegion: z.string().trim().min(2, "Region required").optional().or(z.literal("")),
    facilityCity: z.string().trim().optional().or(z.literal("")),
    facilityAddress: z.string().trim().min(3, "Address required").optional().or(z.literal("")),
    facilityLat: z.number().min(-90).max(90).optional(),
    facilityLng: z.number().min(-180).max(180).optional(),
  })
  .superRefine((data, ctx) => {
    // If requesting hospital_staff, existing facilityId is required
    if (data.requestedRole === "hospital_staff" && (!data.facilityId || data.facilityId === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facilityId"],
        message: "Staff must select an existing hospital",
      });
    }
    // If requesting hospital_admin without an existing facility, new facility details are required
    if (data.requestedRole === "hospital_admin" && (!data.facilityId || data.facilityId === "")) {
      if (!data.facilityName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["facilityName"],
          message: "Facility name is required when registering a new hospital",
        });
      }
      if (!data.facilityType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["facilityType"],
          message: "Facility type is required",
        });
      }
      if (!data.facilityAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["facilityAddress"],
          message: "Facility address is required",
        });
      }
    }
  });

export type OnboardingRequestInput = z.infer<typeof onboardingRequestSchema>;

export const provisionUserSchema = z
  .object({
    clerkUserId: z.string().trim().min(1, "Clerk User ID is required"),
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
    email: z.string().trim().email("Valid email required").toLowerCase(),
    phoneE164: z
      .string()
      .trim()
      .regex(E164, "Phone must be in E.164 format (+251...)")
      .optional()
      .nullable()
      .or(z.literal("")),
    role: z.enum([
      "super_admin",
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
      "efda_officer",
    ]),
    facilityCode: z.string().trim().toUpperCase().optional().nullable().or(z.literal("")),
    active: z.boolean().default(true),
    receivesPickupOtp: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const isHospital = data.role === "hospital_admin" || data.role === "hospital_staff";
    const isDisposal = data.role === "disposal_operator";
    if ((isHospital || isDisposal) && !data.facilityCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facilityCode"],
        message: `${data.role} requires a facility`,
      });
    }
    if (!isHospital && !isDisposal && data.facilityCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facilityCode"],
        message: `${data.role} cannot have a facility`,
      });
    }
    if (data.receivesPickupOtp && !isHospital) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["receivesPickupOtp"],
        message: "Only hospital roles can receive pickup OTPs",
      });
    }
  });

export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;

export const rejectRequestSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason must be at least 3 characters").max(500),
});

export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;
