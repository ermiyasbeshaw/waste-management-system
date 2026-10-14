"use server";

import { revalidatePath } from "next/cache";
import { asAction } from "@/server/api/action";
import { runCertificateJobNow } from "@/server/services/certificates";

/** Generate pending certificates and retry failed ones now (super_admin; the service checks the role). */
export async function runCertificateJobAction() {
  const result = await asAction("runCertificateJob", (requestId) =>
    runCertificateJobNow(requestId)
  );
  if (result.ok) revalidatePath("/admin/certificates");
  return result;
}
