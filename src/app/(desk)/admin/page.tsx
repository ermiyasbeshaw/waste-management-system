import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { CategoryVolumeWidget, FleetMapWidget, TripsTodayWidget } from "@/components/admin/widgets";

/** /admin — Overview: trips in progress, 30-day category volume, today's trips. */
export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Live Fleet GPS Radar</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Trips in progress and their stops. Live positions arrive with GPS tracking (Gate 4).
            </p>
          </div>
          <Suspense fallback={<WidgetSkeleton height="h-[320px]" label="fleet map" />}>
            <FleetMapWidget height="320px" />
          </Suspense>
        </div>

        <Suspense fallback={<WidgetSkeleton height="h-80" label="category volume" />}>
          <CategoryVolumeWidget />
        </Suspense>
      </div>

      <Suspense fallback={<WidgetSkeleton height="h-80" label="today's trips" />}>
        <TripsTodayWidget />
      </Suspense>
    </div>
  );
}
