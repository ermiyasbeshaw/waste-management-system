import { getDisposalDashboard } from "@/server/queries/disposal";
import { ExceptionsList } from "@/components/disposal/container-lists";

/** /disposal/exceptions — missing and refused containers. */
export default async function DisposalExceptionsPage() {
  const data = await getDisposalDashboard();
  return <ExceptionsList rows={data.exceptions} />;
}
