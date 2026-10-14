import { handleCommand } from "@/server/api/command";
import { reasonSchema } from "@/lib/validation/trip";
import { cancelTrip } from "@/server/services/scheduling";

/** POST /api/trips/{id}/cancel — super_admin, written reason (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, reasonSchema, (input, meta) => cancelTrip(params.id, input, meta));
}
