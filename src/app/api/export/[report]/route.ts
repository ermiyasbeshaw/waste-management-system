import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { exportReport } from "@/server/services/exports";

/** GET /api/export/{waste|certificates|invoices|audit}?format=xlsx|pdf — in the caller's scope; audited. */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ report: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
    const { fileName, contentType, bytes } = await exportReport(params.report, format, requestId);
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
