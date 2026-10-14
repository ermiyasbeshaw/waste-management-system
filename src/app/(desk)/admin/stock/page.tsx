import Link from "next/link";
import {
  getDisposalRequests,
  getStockAlerts,
  getStockFacilityOptions,
  getStockPage,
  parseFacilityCode,
  parseStockFilter,
} from "@/server/queries/medicine";
import { RequestsList } from "@/components/medicine/requests-list";
import { StockAlertsPanel } from "@/components/medicine/stock-alerts-panel";
import { StockFilters } from "@/components/medicine/stock-filters";
import { StockTable } from "@/components/medicine/stock-table";
import { ExportLinks } from "@/components/shared/export-links";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/**
 * /admin/stock — medicine stock and disposal requests of every facility, read-only for the Super Administrator
 * (CLAUDE.md §12: oversight; only the EFDA officer decides requests).
 */
export default async function AdminStockPage(props: Props) {
  const searchParams = await props.searchParams;
  const filter = parseStockFilter(searchParams?.filter);
  const facility = parseFacilityCode(searchParams?.facility);
  const after = typeof searchParams?.after === "string" ? searchParams.after : null;
  const [alerts, page, facilities, requests] = await Promise.all([
    getStockAlerts(facility),
    getStockPage(filter, facility, after),
    getStockFacilityOptions(),
    getDisposalRequests(null, facility),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportLinks report="stock" label="stock" />
      </div>
      <StockAlertsPanel rows={alerts} showFacility href="/admin/stock?filter=expiring" />
      <StockFilters
        basePath="/admin/stock"
        filter={filter}
        facilityCode={facility}
        facilities={facilities}
      />
      <StockTable rows={page.rows} editable={false} showFacility />
      {page.nextCursor && (
        <Link
          href={`/admin/stock?${new URLSearchParams({
            ...(filter !== "all" ? { filter } : {}),
            ...(facility ? { facility } : {}),
            after: page.nextCursor,
          })}`}
          className="text-xs text-emerald-400 underline"
        >
          More lines →
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h3 className="text-sm font-semibold text-white">Disposal requests</h3>
        <ExportLinks report="medicine-requests" label="requests" />
      </div>
      <RequestsList rows={requests} canDecide={false} showFacility />
    </div>
  );
}
