import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { getLiveMap } from "@/server/queries/tracking";

/** GET /api/tracking/live — vehicles on trips in progress and their stops (super_admin, efda_officer). */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  try {
    return Response.json(await getLiveMap(), {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
