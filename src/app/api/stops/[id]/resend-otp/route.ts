import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { resendOtp } from "@/server/services/pickup";

/** POST /api/stops/{id}/resend-otp — the assigned driver asks for a new code (cooldown, per-stop limit) (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (_input, meta) => resendOtp(params.id, meta));
}
