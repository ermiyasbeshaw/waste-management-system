import Link from "next/link";
import {
  getStockAlerts,
  getStockFacilityOptions,
  getStockPage,
  parseFacilityCode,
  parseStockFilter,
} from "@/server/queries/medicine";
import { StockAlertsPanel } from "@/components/medicine/stock-alerts-panel";
import { StockFilters } from "@/components/medicine/stock-filters";
import { StockTable } from "@/components/medicine/stock-table";
import { ExportLinks } from "@/components/shared/export-links";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /regulator/stock — medicine stock of every facility, read-only (CLAUDE.md §12). */
export default async function RegulatorStockPage(props: Props) {
  const searchParams = await props.searchParams;
  const filter = parseStockFilter(searchParams?.filter);
  const facility = parseFacilityCode(searchParams?.facility);
  const after = typeof searchParams?.after === "string" ? searchParams.after : null;
  const [alerts, page, facilities] = await Promise.all([
    getStockAlerts(facility),
    getStockPage(filter, facility, after),
    getStockFacilityOptions(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/regulator/approvals"
          className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-500 text-black inline-flex items-center"
        >
          Disposal approvals →
        </Link>
        <ExportLinks report="stock" label="stock" />
      </div>
      <StockAlertsPanel rows={alerts} showFacility href="/regulator/stock?filter=expiring" />
      <StockFilters
        basePath="/regulator/stock"
        filter={filter}
        facilityCode={facility}
        facilities={facilities}
      />
      <StockTable rows={page.rows} editable={false} showFacility />
      {page.nextCursor && (
        <Link
          href={`/regulator/stock?${new URLSearchParams({
            ...(filter !== "all" ? { filter } : {}),
            ...(facility ? { facility } : {}),
            after: page.nextCursor,
          })}`}
          className="text-xs text-emerald-400 underline"
        >
          More lines →
        </Link>
      )}
    </div>
  );
}
