import { Suspense } from "react";
import { parseRegulatorFilters } from "@/server/queries/regulator";
import { RegulatorScope } from "@/components/regulator/regulator-scope";
import { FacilityVolumesWidget, WeeklyTrendWidget } from "@/components/regulator/widgets";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";
import { StockAlertsWidget } from "@/components/medicine/stock-alerts-widget";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /regulator — volume analytics and trends (read-only, SQL aggregates). */
export default async function RegulatorAnalyticsPage(props: Props) {
  const searchParams = await props.searchParams;
  const filters = parseRegulatorFilters(searchParams);
  const key = `${filters.facilityCode}|${filters.categoryCode}`;

  return (
    <div className="space-y-6">
      <RegulatorScope filters={filters} />
      <ExportLinks report="waste" label="waste register" />
      <Suspense fallback={<WidgetSkeleton height="h-40" label="medicine expiry alerts" />}>
        <StockAlertsWidget href="/regulator/stock?filter=expiring" showFacility />
      </Suspense>
      <Suspense key={`weekly|${key}`} fallback={<WidgetSkeleton label="weekly trend" />}>
        <WeeklyTrendWidget filters={filters} />
      </Suspense>
      <Suspense key={`volumes|${key}`} fallback={<WidgetSkeleton label="facility volumes" />}>
        <FacilityVolumesWidget filters={filters} />
      </Suspense>
    </div>
  );
}
