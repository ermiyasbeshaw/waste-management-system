import { errorResponse } from "@/server/errors";
import { getTrackingProvider } from "@/server/integrations/tracking/provider";
import { log, newRequestId } from "@/server/log";
import { createRateLimiter } from "@/server/rate-limit";
import { ingestGpsPoints } from "@/server/services/tracking";

/**
 * GPS tracker ingest (CLAUDE.md §3 public route, authenticated per device token; §6). Returns counts only.
 * ASSUMPTION: 120 requests per minute per device and client address (a tracker reports every few seconds).
 */
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    limiter.hit(`${client}|${req.headers.get("x-device-id") ?? ""}`);
    const { deviceId, token, points } = await getTrackingProvider().parse(req);
    const result = await ingestGpsPoints(deviceId, token, points);
    log.info("GPS points received", {
      requestId,
      deviceId,
      accepted: result.accepted,
      duplicates: result.duplicates,
      rejected: result.rejected.length,
    });
    return Response.json(result, { headers: { "x-request-id": requestId } });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
