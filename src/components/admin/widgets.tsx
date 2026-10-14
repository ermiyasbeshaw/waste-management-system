import Link from "next/link";
import { LiveMap } from "@/components/maps/live-map";
import {
  getAdminCategoryVolume,
  getAdminContracts,
  getAdminFacilities,
  getAdminInvoicesPage,
  getAdminKpis,
  getAdminMap,
  getAdminTripsToday,
} from "@/server/queries/admin";
import { AdminKpiGrid } from "./admin-header";
import { CategoryChart } from "./category-chart";
import { ContractsTable } from "./contracts-table";
import { InvoicesLedger } from "./invoices-ledger";
import { TripsTable } from "./trips-table";

/**
 * Super Administrator widgets (CLAUDE.md §8): one async Server Component per widget, each loading its own data.
 * Pages wrap each widget in <Suspense> with a skeleton.
 */

export async function AdminKpisWidget() {
  return <AdminKpiGrid kpis={await getAdminKpis()} />;
}

export async function FleetMapWidget({ height }: { height: string }) {
  const map = await getAdminMap();
  return <LiveMap initial={map} height={height} />;
}

export async function CategoryVolumeWidget() {
  return <CategoryChart data={{ categoryVolume30d: await getAdminCategoryVolume() }} />;
}

export async function TripsTodayWidget() {
  return <TripsTable rows={await getAdminTripsToday()} />;
}

export async function InvoicesWidget({ cursor }: { cursor: string | null }) {
  const [kpis, page] = await Promise.all([getAdminKpis(), getAdminInvoicesPage(cursor)]);
  return (
    <div className="space-y-3">
      <InvoicesLedger data={{ kpis, invoices: page.rows }} />
      {page.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={`/admin/finance?after=${page.nextCursor}`}
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]"
          >
            Older invoices →
          </Link>
        </div>
      )}
    </div>
  );
}

export async function ContractsWidget() {
  const [data, facilities] = await Promise.all([getAdminContracts(), getAdminFacilities()]);
  return (
    <ContractsTable
      data={data}
      facilities={facilities
        .filter((f) => f.type !== "DISPOSAL_SITE")
        .map((f) => ({ id: f.id, code: f.code, name: f.name }))}
    />
  );
}

export async function CategoryCardsWidget() {
  const categories = await getAdminCategoryVolume();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map((cat) => (
        <div
          key={cat.code}
          className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span
              className="w-3 h-3 rounded-full shadow-glow"
              style={{ backgroundColor: cat.colourHex }}
              aria-hidden="true"
            />
            <span className="font-mono text-xs text-zinc-400 font-semibold">
              {cat.code} · {cat.colourCode}
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{cat.name}</h4>
            <div className="text-2xl font-bold font-mono text-zinc-200 mt-2">
              {cat.kg.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Total recorded in past 30 days</p>
          </div>
        </div>
      ))}
    </div>
  );
}
