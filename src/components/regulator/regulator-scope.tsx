import { Suspense } from "react";
import { AreaTabs } from "@/components/shared/area-tabs";
import { KpiRowSkeleton } from "@/components/shared/skeleton";
import { getRegulatorFilterOptions } from "@/server/queries/regulator";
import type { RegulatorFilters } from "@/types/view-models";
import { RegulatorFilterBar } from "./filters-kpis";
import { RegulatorKpisWidget } from "./widgets";

/**
 * Filters, KPIs and tabs shown at the top of every /regulator page (server component). It lives in the pages,
 * not the layout, because a layout is not re-rendered when only the URL filters change.
 */
export async function RegulatorScope({ filters }: { filters: RegulatorFilters }) {
  const options = await getRegulatorFilterOptions();

  return (
    <>
      <RegulatorFilterBar
        filters={filters}
        facilities={options.facilities}
        categories={options.categories}
      />

      <Suspense
        key={`${filters.facilityCode}|${filters.categoryCode}`}
        fallback={<KpiRowSkeleton />}
      >
        <RegulatorKpisWidget filters={filters} />
      </Suspense>

      <AreaTabs
        accent="indigo"
        keepSearch
        tabs={[
          { href: "/regulator", label: "Volume Analytics & Trends" },
          { href: "/regulator/audit", label: "Immutable Audit Trail Ledger" },
          { href: "/regulator/certificates", label: "Certificates Registry" },
          { href: "/regulator/map", label: "Chain-of-Custody Route Map" },
          { href: "/regulator/stock", label: "Medicine Stock" },
          { href: "/regulator/approvals", label: "Disposal Approvals" },
        ]}
      />
    </>
  );
}
