import { Flame, Truck, Layers, AlertOctagon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import type { DisposalDashboardData } from "@/types/view-models";

/** Plant header + KPI counters for every /disposal route (single column on a phone). */
export function DisposalHeader({ data }: { data: DisposalDashboardData }) {
  return (
    <>
      <PageHeader
        title="Disposal Plant Operations"
        subtitle={data.siteName}
        icon={Flame}
        badgeText="DISPOSAL SITE"
        badgeColor="rose"
      />

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Inbound Trucks En Route"
          value={data.stats.inboundCount}
          subtitle="Trips in progress"
          icon={Truck}
          color="blue"
        />
        <KpiCard
          title="Destruction Queue"
          value={data.stats.queueCount}
          subtitle="Received, waiting for destruction"
          icon={Layers}
          color="amber"
        />
        <KpiCard
          title="Destroyed Today"
          value={`${data.stats.destroyedTodayKg.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`}
          subtitle={`${data.stats.destroyedTodayCount} containers destroyed`}
          icon={Flame}
          color="emerald"
        />
        <KpiCard
          title="Exceptions (30 Days)"
          value={data.stats.exceptionsCount}
          subtitle={`${data.stats.missingCount} Missing • ${data.stats.refusedCount} Refused`}
          icon={AlertOctagon}
          color="rose"
          trend={
            data.stats.exceptionsCount > 0
              ? { value: "Needs follow-up", isWarning: true }
              : undefined
          }
        />
      </div>
    </>
  );
}
