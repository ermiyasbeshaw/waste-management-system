import { AppError, errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { getTripReplay } from "@/server/queries/tracking";

/** GET /api/tracking/trips/{id} — route replay of a started trip (super_admin, efda_officer; read-only). */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const replay = await getTripReplay(params.id);
    if (!replay) throw new AppError("NOT_FOUND", 404, "Trip not found or not started.");
    return Response.json(replay, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
