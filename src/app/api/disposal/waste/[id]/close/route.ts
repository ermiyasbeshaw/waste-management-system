import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { closeWithoutDestruction } from "@/server/services/disposal";

/** POST /api/disposal/waste/{id}/close — all containers missing/refused: close without destruction (reason). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) =>
    closeWithoutDestruction(params.id, input, meta)
  );
}
