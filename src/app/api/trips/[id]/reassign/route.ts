import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { reassignTrip } from "@/server/services/scheduling";

/** POST /api/trips/{id}/reassign — super_admin, PLANNED trips only (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => reassignTrip(params.id, input, meta));
}
