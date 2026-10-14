import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { getTripManifestPdf } from "@/server/services/manifest";

/** GET /api/trips/{id}/manifest — trip manifest PDF (super_admin; the assigned driver). Audited. */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const { tripCode, pdf } = await getTripManifestPdf(params.id, requestId);
    return new Response(pdf.slice().buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="manifest-${tripCode}.pdf"`,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
