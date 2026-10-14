import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { receiveContainer } from "@/server/services/disposal";

/** POST /api/disposal/receive — operator checks in a collected container (Idempotency-Key required). */
export async function POST(req: Request) {
  return handleCommand(req, emptySchema, (input, meta) => receiveContainer(input, meta));
}
