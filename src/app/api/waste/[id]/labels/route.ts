import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { getContainerLabelsPdf } from "@/server/services/labels";

/**
 * GET /api/waste/{id}/labels — the container label sheet (PDF). Signed-in users only (middleware); the service
 * checks the role and the facility scope, and audits every print.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const { wasteCode, pdf } = await getContainerLabelsPdf(params.id, { requestId });
    return new Response(pdf.slice().buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="labels-${wasteCode}.pdf"`,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
