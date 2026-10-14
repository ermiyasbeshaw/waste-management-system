import { errorResponse } from "@/server/errors";
import { requireCronAuth } from "@/server/jobs/cron-auth";
import { log, newRequestId } from "@/server/log";
import { computeStockExpiryAlerts } from "@/server/services/medicine";

/**
 * Medicine expiry alerts only (CLAUDE.md §12): POST with `Authorization: Bearer <CRON_SECRET>`. The daily job runs
 * the same check; this route lets it run on its own (e.g. right after a stock upload, or in tests). Counts only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    requireCronAuth(req);
    const summary = await computeStockExpiryAlerts(undefined, requestId);
    log.info("Stock alerts job finished", { requestId, ...summary });
    return Response.json(summary);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
