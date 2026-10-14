import { handleCommand } from "@/server/api/command";
import { emptySchema } from "@/lib/validation/trip";
import { revokeCertificate } from "@/server/services/certificates";

/** POST /api/certificates/{id}/revoke — super_admin revokes (reason), optionally reissues. Idempotent. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handleCommand(req, emptySchema, (input, meta) =>
    revokeCertificate(params.id, input, meta)
  );
}
