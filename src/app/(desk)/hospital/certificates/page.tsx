import { Suspense } from "react";
import { parseHospitalCursor } from "@/server/queries/hospital";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";
import { CertificatesListWidget } from "@/components/hospital/widgets";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /hospital/certificates — Certificates of Disposal of the facility, 50 per page. */
export default async function HospitalCertificatesPage(props: Props) {
  const searchParams = await props.searchParams;
  const cursor = parseHospitalCursor(searchParams?.after);
  return (
    <div className="space-y-4">
      <ExportLinks report="certificates" label="certificates" />
      <Suspense key={cursor} fallback={<WidgetSkeleton height="h-96" label="certificates" />}>
        <CertificatesListWidget cursor={cursor} />
      </Suspense>
    </div>
  );
}
