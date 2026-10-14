import Link from "next/link";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { getDisposalRequests, getStockPage } from "@/server/queries/medicine";
import { RequestForm } from "@/components/medicine/request-form";
import { RequestsList } from "@/components/medicine/requests-list";
import { ExportLinks } from "@/components/shared/export-links";

/**
 * /hospital/stock/requests — medicine disposal requests of the facility (CLAUDE.md §12). Only the hospital_admin
 * creates requests (owner decision 11 Oct 2026); staff see them. An approved request appears as pharmaceutical
 * waste on the waiting list.
 */
export default async function HospitalStockRequestsPage() {
  const user = await requireAreaAccess("hospital");
  const [stock, requests] = await Promise.all([
    getStockPage("all", null, null, 100),
    getDisposalRequests(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/hospital/stock" className="text-xs text-emerald-400 underline">
          ← Medicine stock
        </Link>
        <ExportLinks report="medicine-requests" label="requests" />
      </div>
      {user.role === "hospital_admin" ? (
        <RequestForm stock={stock.rows.filter((s) => s.quantity > 0)} />
      ) : (
        <p className="text-sm text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
          Only the facility&apos;s Hospital Administrator can request the disposal of medicines.
        </p>
      )}
      <h3 className="text-sm font-semibold text-white">Requests of this facility</h3>
      <RequestsList rows={requests} canDecide={false} showFacility={false} />
    </div>
  );
}
