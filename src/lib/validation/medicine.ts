import { z } from "zod";
import { MAX_WEIGHT_KG } from "./waste";

/** Medicine disposal requests (CLAUDE.md §12). */

const uuid = z.string().uuid("Choose a stock line");

/**
 * A request for disposal of stock lines. ASSUMPTION (owner to confirm): the hospital also enters the number of
 * containers and the weight, because the approved request becomes a waste record, which needs both (CLAUDE.md §6).
 */
export const disposalRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        stockId: uuid,
        quantity: z.coerce
          .number({ invalid_type_error: "Enter a quantity" })
          .int("Whole units only")
          .min(1, "At least 1"),
      })
    )
    .min(1, "Choose at least one stock line")
    .max(200, "At most 200 lines per request")
    .refine((l) => new Set(l.map((x) => x.stockId)).size === l.length, "Each stock line only once"),
  containerCount: z.coerce
    .number({ invalid_type_error: "Enter the number of containers" })
    .int("Whole containers only")
    .min(1, "At least 1 container")
    .max(100, "At most 100 containers"),
  weightKg: z.coerce
    .number({ invalid_type_error: "Enter the weight in kg" })
    .gt(0, "Weight must be more than 0 kg")
    .max(MAX_WEIGHT_KG, "Weight is too large")
    .refine((v) => Math.round(v * 100) / 100 === v, "At most 2 decimals"),
  note: z
    .string()
    .max(500, "At most 500 characters")
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});
export type DisposalRequestInput = z.infer<typeof disposalRequestSchema>;

/** EFDA decision: approve, or reject with a written reason. */
export const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE") }),
  z.object({
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(3, "Write a reason (at least 3 characters)").max(500),
  }),
]);
