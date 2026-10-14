import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { getHospitalActiveHandovers } from "@/server/queries/hospital";

/** GET /api/hospital/active-handover — trucks at the door of the user's OWN facility (hospital roles). */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  try {
    return Response.json(
      { handovers: await getHospitalActiveHandovers() },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } }
    );
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
