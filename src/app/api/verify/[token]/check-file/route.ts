import { AppError, errorResponse } from "@/server/errors";
import { newRequestId } from "@/server/log";
import { createRateLimiter } from "@/server/rate-limit";
import { checkCertificateFile, MAX_CHECK_FILE_BYTES } from "@/server/services/certificates";

/**
 * POST /api/verify/{token}/check-file — public: compares an uploaded PDF (multipart field "file", or the raw
 * body) with the stored SHA-256. The file is not kept. Rate limited per client address (ASSUMPTION: 10 / minute).
 */
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(
  req: Request,
  props: { params: Promise<{ token: string }> }
): Promise<Response> {
  const params = await props.params;
  const requestId = newRequestId();
  try {
    limiter.hit(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CHECK_FILE_BYTES + 64 * 1024) {
      throw new AppError("VALIDATION_ERROR", 422, "Upload the certificate PDF (at most 10 MB).");
    }
    let bytes: Uint8Array;
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof Blob))
        throw new AppError("VALIDATION_ERROR", 422, "Choose a PDF file.");
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = new Uint8Array(await req.arrayBuffer());
    }
    return Response.json(await checkCertificateFile(params.token, bytes), {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
