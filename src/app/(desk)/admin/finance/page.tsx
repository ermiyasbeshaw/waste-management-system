import { Suspense } from "react";
import { parseAdminCursor } from "@/server/queries/admin";
import { WidgetSkeleton } from "@/components/shared/skeleton";
import { ExportLinks } from "@/components/shared/export-links";
import { InvoicesWidget } from "@/components/admin/widgets";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /admin/finance — invoices and billing (ETB). Billing lives in /admin; there is no finance role. */
export default async function AdminFinancePage(props: Props) {
  const searchParams = await props.searchParams;
  const cursor = parseAdminCursor(searchParams?.after);
  return (
    <div className="space-y-4">
      <ExportLinks report="invoices" label="invoices" />
      <Suspense key={cursor} fallback={<WidgetSkeleton height="h-96" label="invoices" />}>
        <InvoicesWidget cursor={cursor} />
      </Suspense>
    </div>
  );
}
