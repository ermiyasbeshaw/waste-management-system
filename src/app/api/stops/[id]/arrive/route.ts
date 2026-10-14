import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { arriveAtStop } from "@/server/services/pickup";

/** POST /api/stops/{id}/arrive — the assigned driver marks the arrival (geofence + OTP) (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (_input, meta) => arriveAtStop(params.id, meta));
}
