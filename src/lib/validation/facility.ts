import { z } from "zod";

/** Facility master data (CLAUDE.md §9 DECISION: optional address parts city / sub_city / woreda / kebele). */
export const FACILITY_TYPES = [
  "REFERRAL_HOSPITAL",
  "GENERAL_HOSPITAL",
  "PRIMARY_HOSPITAL",
  "CLINIC",
  "PHARMACY",
  "DISPOSAL_SITE",
] as const;

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : null));

export const facilitySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/, "Format XX-XXX-000, e.g. DD-CLI-019"),
  name: z.string().trim().min(3, "Enter the facility name").max(160),
  type: z.enum(FACILITY_TYPES, { errorMap: () => ({ message: "Choose a facility type" }) }),
  region: z.string().trim().min(2, "Enter the region").max(120),
  city: optionalText,
  subCity: optionalText,
  woreda: optionalText,
  kebele: optionalText,
  address: z.string().trim().min(3, "Enter the address").max(240),
  lat: z.coerce.number({ invalid_type_error: "Latitude is a number" }).min(-90).max(90),
  lng: z.coerce.number({ invalid_type_error: "Longitude is a number" }).min(-180).max(180),
});
export type FacilityInput = z.infer<typeof facilitySchema>;

export const facilityStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  reason: z.string().trim().max(500).optional(),
});

/** What a super_admin may change on a user (identity itself comes from Clerk). */
export const userAccessSchema = z.object({
  role: z
    .enum([
      "super_admin",
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
      "efda_officer",
    ])
    .nullable(),
  facilityCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/)
    .nullable(),
  active: z.boolean(),
  receivesPickupOtp: z.boolean(),
});
export type UserAccessInput = z.infer<typeof userAccessSchema>;

/** What a hospital_admin may change on a user of their own facility. */
export const hospitalUserSchema = z.object({
  active: z.boolean(),
  receivesPickupOtp: z.boolean(),
});
