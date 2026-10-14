import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { startTrip } from "@/server/services/pickup";

/** POST /api/trips/{id}/start — assigned driver starts the trip (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (_input, meta) => startTrip(params.id, meta));
}
