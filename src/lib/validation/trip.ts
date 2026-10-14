import { z } from "zod";

/** Trip planning and pickup commands (CLAUDE.md §5–§6). The server re-checks everything inside the transaction. */

const uuid = z.string().uuid();
const reason = z.string().trim().min(3, "Write a reason (at least 3 characters)").max(500);

export const tripPlanSchema = z.object({
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  vehicleId: uuid,
  driverId: uuid,
  /** Facilities in visiting order; each stop takes the facility's waiting (REGISTERED) waste. */
  stops: z
    .array(z.object({ facilityCode: z.string().regex(/^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/) }))
    .min(1, "Add at least one stop")
    .max(50),
});
export type TripPlanInput = z.infer<typeof tripPlanSchema>;

export const reasonSchema = z.object({ reason });

export const reassignSchema = z
  .object({ vehicleId: uuid.optional(), driverId: uuid.optional() })
  .refine((r) => r.vehicleId || r.driverId, {
    message: "Choose a new vehicle or driver",
    path: ["vehicleId"],
  });

export const scanSchema = z.object({
  containerCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^WR-\d{4}-\d{5}-C\d{2,3}$/, "Not a container code"),
});

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const emptySchema = z.object({}).passthrough();
