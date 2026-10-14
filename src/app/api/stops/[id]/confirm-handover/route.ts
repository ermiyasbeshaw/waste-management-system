import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { confirmHandover } from "@/server/services/pickup";

/** POST /api/stops/{id}/confirm-handover — a hospital user of the SAME facility confirms in the app (Idempotency-Key required). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (_input, meta) => confirmHandover(params.id, meta));
}
