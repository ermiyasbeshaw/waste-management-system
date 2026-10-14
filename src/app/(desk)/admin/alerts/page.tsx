import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { AlertsWidget } from "@/components/admin/alerts";
import { StockAlertsWidget } from "@/components/medicine/stock-alerts-widget";

/** /admin/alerts — every dashboard alert of CLAUDE.md §6 (thresholds from settings). */
export default function AdminAlertsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<WidgetSkeleton height="h-40" label="medicine expiry alerts" />}>
        <StockAlertsWidget href="/admin/stock?filter=expiring" showFacility />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton height="h-96" label="alerts" />}>
        <AlertsWidget />
      </Suspense>
    </div>
  );
}
