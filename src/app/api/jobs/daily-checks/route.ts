import { errorResponse } from "@/server/errors";
import { requireCronAuth } from "@/server/jobs/cron-auth";
import { log, newRequestId } from "@/server/log";
import { runDailyChecks } from "@/server/services/billing";

/**
 * Daily job (CLAUDE.md §6): POST with `Authorization: Bearer <CRON_SECRET>`. Contract statuses, certificate
 * retries, idempotency-key clean-up; returns counts only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    requireCronAuth(req);
    const summary = await runDailyChecks(null, requestId);
    log.info("Daily checks finished", { requestId, ...summary.contracts, ...summary.alerts });
    return Response.json(summary);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
