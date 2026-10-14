import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { skipStop } from "@/server/services/pickup";

/** POST /api/stops/{id}/skip — driver or super_admin skips the stop with a reason (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => skipStop(params.id, input, meta));
}
