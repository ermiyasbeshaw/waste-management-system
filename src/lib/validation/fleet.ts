import { z } from "zod";

/** Fleet master data (CLAUDE.md §6: 2 vehicles, 2 drivers, trackers with per-device hashed tokens, licences). */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date (YYYY-MM-DD)");
const optional = (s: z.ZodString) =>
  s.optional().transform((v) => (v && v.trim() ? v.trim() : null));

export const vehicleSchema = z.object({
  plateNo: z.string().trim().toUpperCase().min(3, "Enter the plate number").max(20),
  model: optional(z.string().max(80)),
  capacityKg: z.coerce
    .number({ invalid_type_error: "Capacity in kg" })
    .gt(0, "Capacity must be more than 0")
    .max(50_000),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const vehicleStatusSchema = z.object({
  status: z.enum(["ACTIVE", "IN_TRANSIT", "MAINTENANCE", "OFFLINE"]),
});

export const driverProfileSchema = z.object({
  userId: z.string().uuid("Choose a user with the driver role"),
  licenseNo: z.string().trim().min(3, "Enter the driving licence number").max(40),
  defaultVehiclePlate: optional(z.string().max(20)),
});

export const trackerSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,64}$/, "Letters, digits, - and _ only"),
  vehiclePlate: optional(z.string().max(20)),
});

export const licenceSchema = z
  .object({
    subjectType: z.enum(["VEHICLE", "DRIVER", "FACILITY", "SITE"]),
    /** Plate (vehicle), driver licence number (driver) or facility code (facility / site). */
    subjectRef: z.string().trim().min(2, "Choose what the licence is for").max(40),
    kind: z.string().trim().min(3, "What kind of licence?").max(80),
    number: z.string().trim().min(2, "Enter the licence number").max(60),
    issuedOn: date.optional().or(z.literal("").transform(() => undefined)),
    expiresOn: date,
  })
  .refine((l) => !l.issuedOn || l.expiresOn >= l.issuedOn, {
    message: "Expiry must be on or after the issue date",
    path: ["expiresOn"],
  });
export type LicenceInput = z.infer<typeof licenceSchema>;
