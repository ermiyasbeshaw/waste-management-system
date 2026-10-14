import { formatEtb } from "@/lib/money";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { Trash2, Truck, RotateCcw, AlertTriangle, Flame, Shield, CreditCard } from "lucide-react";
import type { AdminKpis } from "@/types/view-models";

/** Page header shown on every /admin sub-route. */
export function AdminPageHeader() {
  return (
    <PageHeader
      title="Admin & Operations Workstation"
      subtitle="Central Control Panel: Biohazard logistics, fleet radar, billing & invoices (ETB), contracts & compliance."
      icon={Shield}
      badgeText="CENTRAL OPERATIONS: ACTIVE"
      badgeColor="emerald"
    />
  );
}

const kg = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;

/** KPI grid (values from the database, thresholds from settings). */
export function AdminKpiGrid({ kpis }: { kpis: AdminKpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard
        title="Awaiting Pickup"
        value={`${kpis.awaitingPickupCount}`}
        subtitle={`${kg(kpis.awaitingPickupKg)} registered`}
        icon={Trash2}
        color="amber"
      />
      <KpiCard
        title="Trips Today"
        value={kpis.tripsTodayCount}
        subtitle={`${kpis.tripsInProgressCount} in progress`}
        icon={Truck}
        color="emerald"
      />
      <KpiCard
        title="In Transit Records"
        value={kpis.inTransitCount}
        subtitle="Collected, on the way to the site"
        icon={RotateCcw}
        color="blue"
      />
      <KpiCard
        title="Awaiting Destruction"
        value={kpis.awaitingDestructionCount}
        subtitle="Containers received at the site"
        icon={Flame}
        color="rose"
      />
      <KpiCard
        title="Outstanding Invoices"
        value={formatEtb(kpis.outstandingSantim)}
        subtitle={`${kpis.outstandingCount} issued, not settled`}
        icon={CreditCard}
        color="purple"
      />
      <KpiCard
        title="Overdue Pickups"
        value={kpis.overduePickupsCount}
        subtitle={`Waiting more than ${kpis.overduePickupDays} days`}
        icon={AlertTriangle}
        color="rose"
        trend={
          kpis.overduePickupsCount > 0 ? { value: "Action required", isWarning: true } : undefined
        }
      />
    </div>
  );
}
