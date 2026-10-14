import Link from "next/link";
import { BellRing } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StockAlertRow } from "@/types/view-models";

/** Expiry alerts panel (CLAUDE.md §12): open alerts in the viewer's scope, most urgent first. */
export function StockAlertsPanel({
  rows,
  showFacility,
  href,
}: {
  rows: StockAlertRow[];
  showFacility: boolean;
  /** Link to the full stock list. */
  href: string;
}) {
  return (
    <section
      aria-label="Medicine expiry alerts"
      className="bg-[#111116] border border-amber-500/20 rounded-2xl p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BellRing className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Medicine expiry alerts ({rows.length})
        </h3>
        <Link href={href} className="text-xs text-emerald-400 underline">
          Open stock
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">No medicine is close to its expiry date.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] text-sm">
          {rows.slice(0, 10).map((r) => (
            <li key={r.stockId} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-zinc-100">
                  {r.item} {r.strength} <span className="text-zinc-500">· batch {r.batch}</span>
                </p>
                <p className="text-xs text-zinc-400">
                  {showFacility ? `${r.facility.name} · ` : ""}
                  {r.quantity} {r.unit} · expiry {r.expiryDate}
                </p>
              </div>
              <span className="flex items-center gap-2 text-xs">
                <StatusBadge status={r.daysLeft < 0 ? "EXPIRED" : "EXPIRING_SOON"} size="sm" />
                <span className="text-zinc-400">
                  {r.daysLeft < 0
                    ? `${-r.daysLeft} day(s) ago`
                    : r.daysLeft === 0
                      ? "today"
                      : `in ${r.daysLeft} day(s)`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 10 && <p className="text-xs text-zinc-500">… and {rows.length - 10} more.</p>}
    </section>
  );
}
