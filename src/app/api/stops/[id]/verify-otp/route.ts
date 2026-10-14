import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { verifyOtp } from "@/server/services/pickup";

/** POST /api/stops/{id}/verify-otp — the assigned driver enters the pickup code (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => verifyOtp(params.id, input, meta));
}
