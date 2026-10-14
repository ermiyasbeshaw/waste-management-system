import { Suspense } from "react";
import { parseHospitalCursor } from "@/server/queries/hospital";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";
import { WasteListWidget } from "@/components/hospital/widgets";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /hospital/waste — all waste records of the facility, 50 per page. */
export default async function HospitalWastePage(props: Props) {
  const searchParams = await props.searchParams;
  const cursor = parseHospitalCursor(searchParams?.after);
  return (
    <div className="space-y-4">
      <ExportLinks report="waste" label="waste register" />
      <Suspense key={cursor} fallback={<WidgetSkeleton height="h-96" label="waste records" />}>
        <WasteListWidget cursor={cursor} />
      </Suspense>
    </div>
  );
}
