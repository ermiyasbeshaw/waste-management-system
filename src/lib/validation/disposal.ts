import { z } from "zod";

/** Disposal site commands (CLAUDE.md §5–§6, Gate 5) and certificate administration. */

const reason = z.string().trim().min(3, "Write a reason (at least 3 characters)").max(500);
const containerCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^WR-\d{4}-\d{5}-C\d{2,3}$/, "Not a container code");

/** A collected container arrives at the site (scan or typed code). */
export const receiveSchema = z.object({ containerCode });

/** A container is missing from the truck, or refused at inspection — a reason is required. */
export const containerExceptionSchema = z.object({
  containerCode,
  kind: z.enum(["MISSING", "REFUSED"]),
  reason,
});

/** Destruction of every received container of one waste record. */
export const destroySchema = z.object({
  methodCode: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z_]{1,47}$/, "Choose a destruction method"),
});

/** Close a waste record of which no container could be destroyed (all MISSING / REFUSED). */
export const closeNoDestructionSchema = z.object({ reason });

/** Revoke an issued certificate; optionally create a new one (reissue = new row, CLAUDE.md §5). */
export const revokeCertificateSchema = z.object({
  reason,
  reissue: z.boolean().default(false),
});
