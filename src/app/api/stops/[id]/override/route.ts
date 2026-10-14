import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { overrideStop } from "@/server/services/pickup";

/** POST /api/stops/{id}/override — super_admin completes without a code (reason; all scans required) (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) => overrideStop(params.id, input, meta));
}
