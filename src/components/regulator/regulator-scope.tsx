import { Suspense } from "react";
import { KpiRowSkeleton } from "@/components/shared/skeleton";
import { getRegulatorFilterOptions } from "@/server/queries/regulator";
import type { RegulatorFilters } from "@/types/view-models";
import { RegulatorFilterBar } from "./filters-kpis";
import { RegulatorKpisWidget } from "./widgets";

/**
 * Filters and KPIs shown at the top of every /regulator page (server component).
 * Navigation is integrated into the primary sidebar and mobile drawer.
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
    </>
  );
}
