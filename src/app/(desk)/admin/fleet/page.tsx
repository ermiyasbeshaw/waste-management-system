import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { FleetMapWidget } from "@/components/admin/widgets";

/** /admin/fleet — full-size fleet radar (trips in progress). */
export default function AdminFleetPage() {
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Full Screen Tactical Fleet Radar</h3>
      <Suspense fallback={<WidgetSkeleton height="h-[520px]" label="fleet map" />}>
        <FleetMapWidget height="520px" />
      </Suspense>
    </div>
  );
}
