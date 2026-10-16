import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { downloadDisposalCertificate } from "@/server/services/medicine";

/**
 * GET /api/certificates/disposal/{id} — signed-in download of medicine disposal certificate PDF
 * (Super Admin, EFDA Officer, Hospital Admin/Staff for their own facility, Disposal Operator).
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const { fileName, bytes } = await downloadDisposalCertificate(params.id, requestId);
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
