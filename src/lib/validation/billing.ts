import { z } from "zod";

/** Contracts and invoices (CLAUDE.md §5–§6; only super_admin writes). Money is entered in ETB, stored in santim. */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date (YYYY-MM-DD)");
const reason = z.string().trim().min(3, "Write a reason (at least 3 characters)").max(500);

/** "1500", "1,500.50" → santim (integer). At most 2 decimals; 0 or more. */
export const etbAmount = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v), "Enter an amount in ETB (up to 2 decimals)")
  .transform((v) => {
    const [whole, cents = ""] = v.split(".");
    return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  });

export const contractSchema = z
  .object({
    facilityCode: z.string().trim().toUpperCase().min(3, "Choose a facility"),
    startDate: date,
    endDate: date,
    monthlyFeeEtb: etbAmount,
    terms: z
      .string()
      .max(2000)
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
  })
  .refine((c) => c.endDate > c.startDate, {
    path: ["endDate"],
    message: "The end date must be after the start date",
  });
export type ContractInput = z.infer<typeof contractSchema>;

/** Changing a running contract: new end date (renewal / shortening), fee for future invoices, terms. */
export const contractUpdateSchema = z.object({
  endDate: date,
  monthlyFeeEtb: etbAmount,
  terms: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});

export const invoiceMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month (YYYY-MM)"),
});

export const settleSchema = z.object({
  reference: z.string().trim().min(2, "Enter the payment reference").max(100),
  settledOn: date,
});

export const cancelInvoiceSchema = z.object({ reason });
