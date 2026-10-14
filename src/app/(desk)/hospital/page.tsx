import { Suspense } from "react";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { TruckAtDoor } from "@/components/hospital/truck-at-door";
import { StockAlertsWidget } from "@/components/medicine/stock-alerts-widget";
import {
  LatestCertificatesWidget,
  OutstandingInvoicesWidget,
  RecentWasteWidget,
} from "@/components/hospital/widgets";

/** /hospital — facility overview: medicine expiry alerts, recent waste, certificates, outstanding invoices (admin only). */
export default async function HospitalOverviewPage() {
  const user = await requireAreaAccess("hospital");

  return (
    <div className="space-y-6">
      <TruckAtDoor />
      <Suspense fallback={<WidgetSkeleton height="h-40" label="medicine expiry alerts" />}>
        <StockAlertsWidget href="/hospital/stock?filter=expiring" showFacility={false} />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton height="h-80" label="recent waste" />}>
        <RecentWasteWidget />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton height="h-80" label="certificates" />}>
        <LatestCertificatesWidget />
      </Suspense>
      {user.role === "hospital_admin" && (
        <Suspense fallback={<WidgetSkeleton height="h-80" label="outstanding invoices" />}>
          <OutstandingInvoicesWidget />
        </Suspense>
      )}
    </div>
  );
}
