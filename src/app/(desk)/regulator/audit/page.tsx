import { Suspense } from "react";
import { parseCursor, parseRegulatorFilters } from "@/server/queries/regulator";
import { RegulatorScope } from "@/components/regulator/regulator-scope";
import { AuditLedgerWidget, EvidenceWidget } from "@/components/regulator/widgets";
import { AuditChainCheck } from "@/components/regulator/audit-chain-check";
import { ExportLinks } from "@/components/shared/export-links";
import { WidgetSkeleton } from "@/components/shared/skeleton";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /regulator/audit — hash-chain check, pickup evidence, audit ledger (newest first, 50 per page). Read-only. */
export default async function RegulatorAuditPage(props: Props) {
  const searchParams = await props.searchParams;
  const filters = parseRegulatorFilters(searchParams);
  const cursor = parseCursor(searchParams?.before);

  return (
    <div className="space-y-6">
      <RegulatorScope filters={filters} />
      <AuditChainCheck />
      <Suspense fallback={<WidgetSkeleton height="h-64" label="pickup evidence" />}>
        <EvidenceWidget />
      </Suspense>
      <ExportLinks report="audit" label="audit log" />
      <Suspense
        key={`audit|${cursor}`}
        fallback={<WidgetSkeleton height="h-96" label="audit ledger" />}
      >
        <AuditLedgerWidget filters={filters} cursor={cursor} />
      </Suspense>
    </div>
  );
}
