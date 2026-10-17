import Link from "next/link";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { getAllAvailableStock, getDisposalRequests } from "@/server/queries/medicine";
import { RequestForm } from "@/components/medicine/request-form";
import { RequestsList } from "@/components/medicine/requests-list";
import { ExportLinks } from "@/components/shared/export-links";

/**
 * /hospital/stock/requests — medicine disposal requests of the facility (CLAUDE.md §12). Hospital staff
 * create disposal requests for all available stock; hospital admin reviews and approves them.
 */
export default async function HospitalStockRequestsPage() {
  const user = await requireAreaAccess("hospital");
  const isStaff = user.role === "hospital_staff";
  const [stockRows, requests] = await Promise.all([
    getAllAvailableStock(),
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
      {isStaff ? (
        <RequestForm stock={stockRows} />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-zinc-300">
          <p className="font-semibold text-emerald-400">Hospital Administrator Approval Station</p>
          <p className="mt-1 text-zinc-400">
            Disposal requests are initiated exclusively by Hospital Staff. As Hospital Administrator, you review and approve or reject pending requests below before they route to the Super Administrator for driver assignment (or EFDA for expired medicine).
          </p>
        </div>
      )}
      <h3 className="text-sm font-semibold text-white">Requests of this facility</h3>
      <RequestsList
        rows={requests}
        canDecide={user.role === "hospital_admin"}
        showFacility={false}
      />
    </div>
  );
}
