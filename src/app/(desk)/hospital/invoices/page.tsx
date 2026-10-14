import { Suspense } from "react";
import { requireAreaAccess } from "@/server/auth/area-guard";
import { parseHospitalCursor } from "@/server/queries/hospital";
import { ErrorState } from "@/components/shared/error-state";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";
import { InvoicesListWidget } from "@/components/hospital/widgets";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /hospital/invoices — hospital_admin only (CLAUDE.md §3); the query refuses other roles as well. */
export default async function HospitalInvoicesPage(props: Props) {
  const searchParams = await props.searchParams;
  const user = await requireAreaAccess("hospital");
  if (user.role !== "hospital_admin") {
    return (
      <ErrorState
        title="Invoices are for Hospital Administrators"
        description="Your role cannot view billing for this facility."
      />
    );
  }
  const cursor = parseHospitalCursor(searchParams?.after);
  return (
    <div className="space-y-4">
      <ExportLinks report="invoices" label="invoices" />
      <Suspense key={cursor} fallback={<WidgetSkeleton height="h-96" label="invoices" />}>
        <InvoicesListWidget cursor={cursor} />
      </Suspense>
    </div>
  );
}
