import { z } from "zod";

/**
 * Waste registration input (CLAUDE.md §6): category required, `container_count >= 1`, `weight_kg > 0`. Shared by
 * the form (browser) and the service (server) — the server always validates again. The facility is NOT part of
 * the input: it is always the signed-in hospital user's own facility.
 *
 * ASSUMPTION (sanity limits, not business rules — confirm with the client): at most 100 containers and
 * 10 000 kg per registration; weight with at most 2 decimals (the column is numeric(10,2)).
 */
/**
 * Categories that hold medicines (CLAUDE.md §12, owner decision 11 Oct 2026): they enter the system ONLY through an
 * EFDA-approved medicine disposal request, never through direct registration. ASSUMPTION: PHARMACEUTICAL is the
 * medicine category.
 */
export const EFDA_APPROVAL_CATEGORIES: readonly string[] = ["PHARMACEUTICAL"];

export const MAX_CONTAINERS_PER_REGISTRATION = 100;
export const MAX_WEIGHT_KG = 10_000;

export const registerWasteSchema = z.object({
  categoryCode: z
    .string({ required_error: "Choose a waste category" })
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Choose a waste category"),
  containerCount: z.coerce
    .number({ invalid_type_error: "Enter the number of containers" })
    .int("Whole containers only")
    .min(1, "At least 1 container")
    .max(MAX_CONTAINERS_PER_REGISTRATION, `At most ${MAX_CONTAINERS_PER_REGISTRATION} containers`),
  weightKg: z.coerce
    .number({ invalid_type_error: "Enter the weight in kg" })
    .gt(0, "Weight must be more than 0 kg")
    .max(MAX_WEIGHT_KG, `At most ${MAX_WEIGHT_KG.toLocaleString("en-US")} kg`)
    .refine((v) => Math.round(v * 100) / 100 === v, "At most 2 decimals"),
});

export type RegisterWasteInput = z.infer<typeof registerWasteSchema>;
