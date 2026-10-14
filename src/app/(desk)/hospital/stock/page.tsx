import Link from "next/link";
import { getStockAlerts, getStockPage, parseStockFilter } from "@/server/queries/medicine";
import { StockAlertsPanel } from "@/components/medicine/stock-alerts-panel";
import { StockFilters } from "@/components/medicine/stock-filters";
import { StockLineForm } from "@/components/medicine/stock-line-form";
import { StockTable } from "@/components/medicine/stock-table";
import { StockUpload } from "@/components/medicine/stock-upload";
import { ExportLinks } from "@/components/shared/export-links";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/** /hospital/stock — the facility's medicine stock (CLAUDE.md §12): upload, add, edit, expiry alerts. Own facility. */
export default async function HospitalStockPage(props: Props) {
  const searchParams = await props.searchParams;
  const filter = parseStockFilter(searchParams?.filter);
  const after = typeof searchParams?.after === "string" ? searchParams.after : null;
  const [alerts, page] = await Promise.all([getStockAlerts(), getStockPage(filter, null, after)]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/hospital/stock/requests"
          className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-emerald-500 text-black inline-flex items-center"
        >
          Disposal requests →
        </Link>
        <ExportLinks report="stock" label="stock" />
      </div>
      <StockAlertsPanel rows={alerts} showFacility={false} href="/hospital/stock?filter=expiring" />
      <StockUpload />
      <StockLineForm />
      <StockFilters basePath="/hospital/stock" filter={filter} facilityCode={null} />
      <StockTable rows={page.rows} editable showFacility={false} />
      {page.nextCursor && (
        <Link
          href={`/hospital/stock?${new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), after: page.nextCursor })}`}
          className="text-xs text-emerald-400 underline"
        >
          More lines →
        </Link>
      )}
    </div>
  );
}
