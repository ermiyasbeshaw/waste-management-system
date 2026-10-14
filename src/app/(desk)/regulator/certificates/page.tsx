import { Suspense } from "react";
import { parseCursor, parseRegulatorFilters } from "@/server/queries/regulator";
import { RegulatorScope } from "@/components/regulator/regulator-scope";
import { CertificatesWidget } from "@/components/regulator/widgets";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /regulator/certificates — certificates registry, 50 per page (read-only). */
export default async function RegulatorCertificatesPage(props: Props) {
  const searchParams = await props.searchParams;
  const filters = parseRegulatorFilters(searchParams);
  const cursor = parseCursor(searchParams?.after);
  const key = `${filters.facilityCode}|${filters.categoryCode}|${cursor}`;

  return (
    <div className="space-y-6">
      <RegulatorScope filters={filters} />
      <ExportLinks report="certificates" label="certificates" />
      <Suspense key={key} fallback={<WidgetSkeleton height="h-96" label="certificates" />}>
        <CertificatesWidget filters={filters} cursor={cursor} />
      </Suspense>
    </div>
  );
}
