import "server-only";
import type { z } from "zod";
import type { JsonValue } from "@/server/audit/hash";
import type { ActiveUser } from "@/server/auth/access-rules";
import type { DbExecutor } from "@/server/db/executor";
import { AppError, errorResponse } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency/store";
import { newRequestId } from "@/server/log";
import { inWorkflow } from "@/server/workflow/engine";

/**
 * Request pipeline for operational commands (CLAUDE.md §6, architecture §14.3):
 * authenticate → load DB role / scope → zod validation → idempotency → service → Workflow Engine transaction
 * (owned-table writes + audit + outbox) → commit → response. No step may be skipped.
 */

export interface CommandMeta {
  requestId: string;
  idempotencyKey: string | null;
}

/** Route Handler side: request ID, JSON body + zod (422), Idempotency-Key header, error → `{ error }` JSON. */
export async function handleCommand<S extends z.ZodTypeAny, T>(
  req: Request,
  schema: S,
  run: (input: z.infer<S>, meta: CommandMeta) => Promise<T>
): Promise<Response> {
  const requestId = newRequestId();
  try {
    let body: unknown = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new AppError("BAD_REQUEST", 400, "The request body is not valid JSON.");
      }
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", 422, "Please correct the highlighted fields.", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const result = await run(parsed.data, {
      requestId,
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return Response.json(result, { headers: { "X-Request-Id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

/**
 * Service side: one transaction that checks + stores the idempotency key and runs the command; a replay returns
 * the stored response without running anything (CLAUDE.md §6). The caller has already checked the role.
 */
export async function runIdempotent<T extends JsonValue>(
  user: ActiveUser,
  route: string,
  meta: CommandMeta,
  request: unknown,
  fn: (tx: DbExecutor) => Promise<T>
): Promise<T> {
  return inWorkflow(async (tx) => {
    const result = await withIdempotency(
      tx,
      { key: meta.idempotencyKey, userId: user.id, route, request },
      async () => ({ status: 200, body: await fn(tx) })
    );
    return result.body;
  });
}
