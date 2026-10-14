import { Suspense } from "react";
import { parseRegulatorFilters } from "@/server/queries/regulator";
import { RegulatorScope } from "@/components/regulator/regulator-scope";
import { RouteMapWidget, RouteReplayWidget } from "@/components/regulator/widgets";
import { WidgetSkeleton } from "@/components/shared/skeleton";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /regulator/map — live positions of trips in progress and route replay (?trip=<id>). */
export default async function RegulatorMapPage(props: Props) {
  const searchParams = await props.searchParams;
  return (
    <div className="space-y-6">
      <RegulatorScope filters={parseRegulatorFilters(searchParams)} />
      <Suspense fallback={<WidgetSkeleton height="h-[540px]" label="route map" />}>
        <RouteMapWidget />
      </Suspense>
      <Suspense fallback={<WidgetSkeleton height="h-[520px]" label="route replay" />}>
        <RouteReplayWidget
          tripId={typeof searchParams?.trip === "string" ? searchParams.trip : null}
        />
      </Suspense>
    </div>
  );
}
