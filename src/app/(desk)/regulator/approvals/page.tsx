import { getDisposalRequests } from "@/server/queries/medicine";
import { RequestsList } from "@/components/medicine/requests-list";
import { ExportLinks } from "@/components/shared/export-links";

/**
 * /regulator/approvals — medicine disposal requests of every facility (CLAUDE.md §12). The EFDA officer is the only
 * role that approves or rejects (reason required); approval creates the pharmaceutical waste record.
 */
export default async function RegulatorApprovalsPage() {
  const requests = await getDisposalRequests();
  const waiting = requests.filter((r) => r.status === "PENDING_EFDA_APPROVAL").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">
          Medicine disposal requests{" "}
          <span className="text-zinc-400 font-normal">· {waiting} waiting</span>
        </h2>
        <ExportLinks report="medicine-requests" label="requests" />
      </div>
      <RequestsList rows={requests} canDecide showFacility />
    </div>
  );
}
