import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { invoicePdf } from "@/server/services/billing";

/** GET /api/invoices/{id}/pdf — super_admin (any), hospital_admin (own facility, never drafts). Audited. */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const { fileName, bytes } = await invoicePdf(params.id, requestId);
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
