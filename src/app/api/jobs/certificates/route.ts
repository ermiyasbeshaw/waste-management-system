import { errorResponse } from "@/server/errors";
import { requireCronAuth } from "@/server/jobs/cron-auth";
import { log, newRequestId } from "@/server/log";
import { processCertificateQueue } from "@/server/services/certificates";

/**
 * Certificate job (CLAUDE.md §6): POST with `Authorization: Bearer <CRON_SECRET>`. Generates PENDING certificates
 * and retries FAILED ones (FAILED → ISSUED). Returns counts only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    requireCronAuth(req);
    const summary = await processCertificateQueue({ limit: 50 });
    log.info("Certificate job finished", { requestId, ...summary });
    return Response.json(summary);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
