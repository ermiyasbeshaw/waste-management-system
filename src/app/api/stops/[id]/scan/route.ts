import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { scanContainer } from "@/server/services/pickup";

/** POST /api/stops/{id}/scan — the assigned driver scans one container (evidence only) (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => scanContainer(params.id, input, meta));
}
