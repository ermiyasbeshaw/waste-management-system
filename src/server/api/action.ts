import "server-only";
import { AppError } from "@/server/errors";
import { log, newRequestId } from "@/server/log";

/** What every Server Action returns to its form: data, or a message plus per-field errors. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields?: Record<string, string[] | undefined> };

/**
 * Runs a service call for a Server Action (CLAUDE.md §8: actions only translate; services check roles and
 * write). AppErrors become readable results; anything else is logged with a request ID and shown generically.
 */
export async function asAction<T>(
  name: string,
  fn: (requestId: string) => Promise<T>
): Promise<ActionResult<T>> {
  const requestId = newRequestId();
  try {
    return { ok: true, data: await fn(requestId) };
  } catch (err) {
    if (err instanceof AppError) {
      const fields = (err.details as { fields?: Record<string, string[] | undefined> }).fields;
      return { ok: false, message: err.message, fields };
    }
    log.error(`${name} failed`, err, { requestId });
    return {
      ok: false,
      message: `Something went wrong. Please try again (reference ${requestId}).`,
    };
  }
}
