import { env } from "@/env";
import { parseClerkUserEvent, verifyClerkWebhook } from "@/server/auth/clerk-webhook";
import { AppError, errorResponse } from "@/server/errors";
import { log, newRequestId } from "@/server/log";
import { syncClerkUser } from "@/server/services/users";

/**
 * POST /api/webhooks/clerk (CLAUDE.md §3 public route, verified by signature; §4 phone sync). Configure in the Clerk
 * dashboard for user.created, user.updated and user.deleted, with the signing secret in CLERK_WEBHOOK_SECRET.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!env.CLERK_WEBHOOK_SECRET) {
      throw new AppError("NOT_CONFIGURED", 503, "The Clerk webhook is not configured.");
    }
    const body = await req.text();
    const ok = verifyClerkWebhook(
      env.CLERK_WEBHOOK_SECRET,
      {
        id: req.headers.get("svix-id"),
        timestamp: req.headers.get("svix-timestamp"),
        signature: req.headers.get("svix-signature"),
      },
      body
    );
    if (!ok) throw new AppError("UNAUTHENTICATED", 401, "Invalid webhook signature.");
    const evt = parseClerkUserEvent(body);
    if (!evt) return Response.json({ result: "ignored" });
    const { result } = await syncClerkUser(evt, requestId);
    log.info("Clerk webhook", { requestId, type: evt.type, result });
    return Response.json({ result });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
