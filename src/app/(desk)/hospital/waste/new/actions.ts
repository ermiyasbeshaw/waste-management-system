"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/server/errors";
import { log, newRequestId } from "@/server/log";
import { registerWaste, type RegisteredWaste } from "@/server/services/waste";

export type RegisterWasteResult =
  | { ok: true; waste: RegisteredWaste }
  | { ok: false; message: string; fields?: Record<string, string[] | undefined> };

/**
 * Server Action for the registration form. It only translates: the service does the role / facility check,
 * validation, idempotency and the transaction. Unexpected errors are logged with the request ID and shown as a
 * generic message (never the internal text).
 */
export async function registerWasteAction(
  input: unknown,
  idempotencyKey: string
): Promise<RegisterWasteResult> {
  const requestId = newRequestId();
  try {
    const waste = await registerWaste(input, { idempotencyKey, requestId });
    revalidatePath("/hospital", "layout");
    return { ok: true, waste };
  } catch (err) {
    if (err instanceof AppError) {
      const fields = (err.details as { fields?: Record<string, string[] | undefined> }).fields;
      return { ok: false, message: err.message, fields };
    }
    log.error("Waste registration failed", err, { requestId });
    return {
      ok: false,
      message: `Something went wrong. Please try again (reference ${requestId}).`,
    };
  }
}
