import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { downloadCertificate } from "@/server/services/certificates";

/**
 * GET /api/certificates/{id}/pdf — signed-in download (super_admin, EFDA officer; hospital roles for their own
 * facility). Audited. Served by the app itself: the storage adapter has no public URLs.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const { fileName, bytes } = await downloadCertificate(params.id, requestId);
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
