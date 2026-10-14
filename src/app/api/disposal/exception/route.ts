import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { recordContainerException } from "@/server/services/disposal";

/** POST /api/disposal/exception — container MISSING or REFUSED with a reason (Idempotency-Key required). */
export async function POST(req: Request) {
  return handleCommand(req, emptySchema, (input, meta) => recordContainerException(input, meta));
}
