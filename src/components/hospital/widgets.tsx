import Link from "next/link";
import { CalendarCheck, CheckCircle2, Clock, CreditCard, PackagePlus, Truck } from "lucide-react";
import { formatEtb } from "@/lib/money";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  getHospitalCertificatesPage,
  getHospitalInvoicesPage,
  getHospitalKpis,
  getHospitalOutstanding,
  getHospitalWastePage,
} from "@/server/queries/hospital";
import { CertificateTable, InvoiceTable, WasteTable } from "./columns";

/**
 * Hospital dashboard widgets (CLAUDE.md §8): one async Server Component per widget; every query is scoped to the
 * signed-in user's own facility inside SQL. Pages wrap each widget in <Suspense> with a skeleton.
 */

const kg = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;

function OlderLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex justify-end">
      <Link
        href={href}
        className="min-h-[44px] inline-flex items-center px-4 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08]"
      >
        {label} →
      </Link>
    </div>
  );
}

/** Entry point to /hospital/waste/new (hospital_admin and hospital_staff may register waste). */
function RegisterWasteLink() {
  return (
    <div className="flex justify-end">
      <Link
        href="/hospital/waste/new"
        className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white"
      >
        <PackagePlus className="w-4 h-4" aria-hidden="true" />
        Register waste
      </Link>
    </div>
  );
}

export async function HospitalKpisWidget() {
  const k = await getHospitalKpis();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Waiting for Pickup"
        value={k.waitingPickupCount}
        subtitle={`${kg(k.waitingPickupKg)} registered on-site`}
        icon={Clock}
        color="amber"
      />
      <KpiCard
        title="Scheduled Pickups"
        value={k.scheduledCount}
        subtitle="On a planned or running trip"
        icon={CalendarCheck}
        color="cyan"
      />
      <KpiCard
        title="In Transit"
        value={k.inTransitCount}
        subtitle="Collected, on the way to the disposal site"
        icon={Truck}
        color="blue"
      />
      <KpiCard
        title="Disposed This Month"
        value={kg(k.disposedThisMonthKg)}
        subtitle={`${k.disposedThisMonthCount} waste records destroyed`}
        icon={CheckCircle2}
        color="emerald"
      />
    </div>
  );
}

export async function RecentWasteWidget() {
  const page = await getHospitalWastePage(null, 10);
  return (
    <div className="space-y-3">
      <WasteTable
        rows={page.rows}
        title="Recent Waste Manifests"
        description="The 10 most recent waste records of this facility"
      />
    </div>
  );
}

export async function WasteListWidget({ cursor }: { cursor: string | null }) {
  const page = await getHospitalWastePage(cursor);
  return (
    <div className="space-y-3">
      <RegisterWasteLink />
      <WasteTable
        rows={page.rows}
        title="All Facility Waste Records"
        description="Every waste record of this facility, newest first"
      />
      {page.nextCursor && (
        <OlderLink label="Older records" href={`/hospital/waste?after=${page.nextCursor}`} />
      )}
    </div>
  );
}

export async function LatestCertificatesWidget() {
  const page = await getHospitalCertificatesPage(null, 10);
  return (
    <CertificateTable
      rows={page.rows}
      title="Latest Destruction Certificates"
      description="Certificates of Disposal for this facility's waste; only ISSUED ones are valid"
    />
  );
}

export async function CertificatesListWidget({ cursor }: { cursor: string | null }) {
  const page = await getHospitalCertificatesPage(cursor);
  return (
    <div className="space-y-3">
      <CertificateTable
        rows={page.rows}
        title="Destruction Certificates Registry"
        description="Certificates of Disposal for this facility's waste, newest first"
      />
      {page.nextCursor && (
        <OlderLink
          label="Older certificates"
          href={`/hospital/certificates?after=${page.nextCursor}`}
        />
      )}
    </div>
  );
}

/** hospital_admin only (the page checks the role before rendering it). */
export async function OutstandingInvoicesWidget() {
  const { rows, totalSantim } = await getHospitalOutstanding();
  return (
    <div className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Outstanding Waste Invoices</h3>
            <p className="text-xs text-zinc-400">Issued invoices not yet settled</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold font-mono text-white">{formatEtb(totalSantim)}</div>
          <span className="text-[10px] text-zinc-500 font-mono">Total Due Balance</span>
        </div>
      </div>
      <InvoiceTable rows={rows} />
    </div>
  );
}

/** hospital_admin only. */
export async function InvoicesListWidget({ cursor }: { cursor: string | null }) {
  const page = await getHospitalInvoicesPage(cursor);
  return (
    <div className="space-y-3">
      <InvoiceTable
        rows={page.rows}
        title="Financial Invoices & Receipts"
        description="Monthly statements for disposal services (ETB, VAT included)"
      />
      {page.nextCursor && (
        <OlderLink label="Older invoices" href={`/hospital/invoices?after=${page.nextCursor}`} />
      )}
    </div>
  );
}
