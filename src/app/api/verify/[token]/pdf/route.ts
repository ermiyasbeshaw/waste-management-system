import { errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { createRateLimiter } from "@/server/rate-limit";
import { downloadPublicCertificate } from "@/server/services/certificates";

/** GET /api/verify/{token}/pdf — public download of an ISSUED certificate (no sign-in; rate limited; audited). */
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    limiter.hit(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
    const { fileName, bytes } = await downloadPublicCertificate(params.token, requestId);
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
