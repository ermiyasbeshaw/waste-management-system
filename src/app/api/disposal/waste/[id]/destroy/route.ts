import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { destroyWaste } from "@/server/services/disposal";

/** POST /api/disposal/waste/{id}/destroy — destruction (locks the record, certificate PENDING). Idempotent. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => destroyWaste(params.id, input, meta));
}
