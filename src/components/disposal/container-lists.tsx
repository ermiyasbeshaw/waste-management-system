"use client";

import { formatDate, formatTime } from "@/lib/dates";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { queueColumns, exceptionsColumns } from "./columns";
import type { QueueContainer, ExceptionContainer } from "@/types/view-models";

const COLOUR: Record<string, string> = { YELLOW: "#eab308", RED: "#ef4444", BLUE: "#3b82f6" };

/** Destruction queue: cards on a phone, the existing table from the md breakpoint up. */
export function QueueList({ rows }: { rows: QueueContainer[] }) {
  return (
    <>
      <section className="md:hidden space-y-3" aria-label="Destruction queue">
        <h2 className="text-base font-semibold text-white">
          Staged containers awaiting destruction
        </h2>
        {rows.length === 0 && <EmptyState title="Queue is empty" />}
        {rows.map((c) => (
          <article
            key={c.id}
            className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono font-bold text-white break-all">{c.containerCode}</p>
                <p className="font-mono text-xs text-zinc-500 break-all">Waste ID: {c.wasteCode}</p>
              </div>
              <StatusBadge status={c.status} size="sm" />
            </div>
            <p className="text-sm text-zinc-200 font-medium">{c.facility.name}</p>
            <p className="flex items-center gap-2 text-sm text-zinc-300">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLOUR[c.category.colourCode] ?? "#b45309" }}
                aria-hidden="true"
              />
              {c.category.name}
            </p>
            <div className="flex justify-end text-sm text-zinc-400 pt-2 border-t border-white/[0.04]">
              <span className="font-mono">
                Received {c.receivedAt ? formatTime(c.receivedAt) : "-"}
              </span>
            </div>
          </article>
        ))}
      </section>
      <div className="hidden md:block">
        <DataTable
          title="Staged Containers Awaiting Incineration / Sterilization"
          description="Chronological queue (oldest arrival first) awaiting high-temperature kiln feed"
          data={rows}
          columns={queueColumns}
          searchKey="containerCode"
          searchPlaceholder="Search container code..."
        />
      </div>
    </>
  );
}

/** Missing / refused containers: cards on a phone, the existing table from md up. */
export function ExceptionsList({ rows }: { rows: ExceptionContainer[] }) {
  return (
    <>
      <section className="md:hidden space-y-3" aria-label="Container exceptions">
        <h2 className="text-base font-semibold text-white">Container exceptions (last 30 days)</h2>
        {rows.length === 0 && <EmptyState title="No exceptions" />}
        {rows.map((c) => (
          <article
            key={c.id}
            className="bg-[#111116] border border-rose-500/20 rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono font-bold text-rose-400 break-all">{c.containerCode}</p>
              <StatusBadge status={c.status} size="sm" />
            </div>
            <p className="text-sm text-zinc-200">{c.facility.name}</p>
            <p className="text-sm text-rose-300 font-medium">
              {c.reason || "Pending investigation"}
            </p>
            <p className="font-mono text-xs text-zinc-400">{formatDate(c.at)}</p>
          </article>
        ))}
      </section>
      <div className="hidden md:block">
        <DataTable
          title="Container Exceptions Log (Last 30 Days)"
          description="MISSING containers lost in chain-of-custody or REFUSED at plant inspection"
          data={rows}
          columns={exceptionsColumns}
          searchKey="containerCode"
        />
      </div>
    </>
  );
}
