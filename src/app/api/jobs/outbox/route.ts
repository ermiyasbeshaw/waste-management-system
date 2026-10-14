import { errorResponse } from "@/server/errors";
import { requireCronAuth } from "@/server/jobs/cron-auth";
import { log, newRequestId } from "@/server/log";
import { dispatchPending } from "@/server/outbox/dispatcher";

/**
 * Outbox job (CLAUDE.md §6): every minute, POST with `Authorization: Bearer <CRON_SECRET>`.
 * Sends pending SMS / email with retries; returns counts only (no message content).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    requireCronAuth(req);
    const summary = await dispatchPending({ limit: 100 });
    log.info("Outbox job finished", { requestId, ...summary });
    return Response.json(summary);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
