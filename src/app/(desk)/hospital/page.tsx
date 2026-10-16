import { Suspense } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { TruckAtDoor } from "@/components/hospital/truck-at-door";
import { StockAlertsWidget } from "@/components/medicine/stock-alerts-widget";
import { RequestsList } from "@/components/medicine/requests-list";
import { getDisposalRequests } from "@/server/queries/medicine";
import {
  LatestCertificatesWidget,
  OutstandingInvoicesWidget,
  RecentWasteWidget,
} from "@/components/hospital/widgets";

/** /hospital — facility overview: medicine expiry alerts, recent waste, certificates, outstanding invoices (admin only). */
export default async function HospitalOverviewPage() {
  const user = await requireAreaAccess("hospital");
  const requests = await getDisposalRequests().catch(() => []);
  const pendingRequests = requests.filter((r) => r.status === "PENDING_APPROVAL");

  return (
    <div className="space-y-6">
      <TruckAtDoor />

      {/* Hospital Administrator: Pending Disposal Requests Awaiting Approval */}
      {user.role === "hospital_admin" && (
        <section className="bg-[#111116] border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  Disposal Requests Awaiting Hospital Approval
                </h2>
                {pendingRequests.length > 0 && (
                  <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35 px-2.5 py-0.5 rounded-full">
                    {pendingRequests.length} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Disposal requests initiated by Hospital Staff. Review and approve or reject requests before they route to Super Admin for driver assignment.
              </p>
            </div>
            <Link
              href="/hospital/stock/requests"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline"
            >
              All facility requests →
            </Link>
          </div>
          <RequestsList
            rows={requests}
            canDecide={true}
            showFacility={false}
          />
        </section>
      )}
      <Suspense fallback={<WidgetSkeleton height="h-40" label="medicine expiry alerts" />}>
        <StockAlertsWidget href="/hospital/stock?filter=expiring" showFacility={false} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton height="h-80" label="recent waste" />}>
        <RecentWasteWidget />
      </Suspense>
      {user.role === "hospital_admin" && (
        <Suspense fallback={<WidgetSkeleton height="h-80" label="certificates" />}>
          <LatestCertificatesWidget />
        </Suspense>
      )}
      {user.role === "hospital_admin" && (
        <Suspense fallback={<WidgetSkeleton height="h-80" label="outstanding invoices" />}>
          <OutstandingInvoicesWidget />
        </Suspense>
      )}
    </div>
  );
}
