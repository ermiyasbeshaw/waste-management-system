"use client";

import { useState, useTransition } from "react";
import { archiveStockLineAction, updateStockLineAction } from "@/app/(desk)/hospital/stock/actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { StockRow } from "@/types/view-models";

/**
 * Stock list (CLAUDE.md §12). Hospital users of the facility can edit or archive a line (history in the audit log);
 * super_admin and EFDA see the same list read-only, with the facility column.
 */

const cell = "px-3 py-2 align-top";
const input =
  "w-full min-h-[34px] bg-[#161622] border border-white/[0.1] rounded-lg px-2 text-xs text-zinc-100";

function EditRow({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [v, setV] = useState({
    item: row.item,
    strength: row.strength,
    form: row.form,
    batch: row.batch,
    quantity: String(row.quantity),
    unit: row.unit,
    expiryDate: row.expiryDate,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof v, label: string, type = "text") => (
    <label className="text-[11px] text-zinc-400 space-y-1">
      <span className="block">{label}</span>
      <input
        type={type}
        value={v[k]}
        onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        className={input}
      />
    </label>
  );
  return (
    <tr className="bg-white/[0.02]">
      <td colSpan={9} className="p-3">
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {field("item", "Item")}
          {field("strength", "Strength")}
          {field("form", "Form")}
          {field("batch", "Batch")}
          {field("quantity", "Quantity", "number")}
          {field("unit", "Unit")}
          {field("expiryDate", "Expiry date", "date")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateStockLineAction(row.id, v);
                if (r.ok) onClose();
                else setError(r.message);
              })
            }
            className="min-h-[34px] px-3 rounded-lg text-xs font-semibold bg-emerald-500 text-black disabled:opacity-50"
          >
            Save
          </button>
          <button type="button" onClick={onClose} className="text-xs text-zinc-400">
            Cancel
          </button>
          {error && (
            <span role="alert" className="text-xs text-rose-300">
              {error}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function StockTable({
  rows,
  editable,
  showFacility,
}: {
  rows: StockRow[];
  editable: boolean;
  showFacility: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (rows.length === 0)
    return <EmptyState title="No stock lines" description="Nothing matches this view." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#111116]">
      {message && (
        <p role="alert" className="p-3 text-xs text-rose-300">
          {message}
        </p>
      )}
      <table className="w-full text-xs text-zinc-300">
        <thead className="text-left text-zinc-500">
          <tr>
            {showFacility && <th className={cell}>Facility</th>}
            <th className={cell}>Item</th>
            <th className={cell}>Strength / form</th>
            <th className={cell}>Batch</th>
            <th className={cell}>Quantity</th>
            <th className={cell}>Expiry</th>
            <th className={cell}>Status</th>
            {editable && <th className={cell}>Change</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} row={r} onClose={() => setEditing(null)} />
            ) : (
              <tr key={r.id} className="border-t border-white/[0.05]">
                {showFacility && <td className={cell}>{r.facility.name}</td>}
                <td className={`${cell} text-zinc-100`}>{r.item}</td>
                <td className={cell}>{[r.strength, r.form].filter(Boolean).join(" · ") || "—"}</td>
                <td className={`${cell} font-mono`}>{r.batch}</td>
                <td className={cell}>
                  {r.quantity} {r.unit}
                </td>
                <td className={`${cell} font-mono`}>
                  {r.expiryDate}
                  <span className="block text-[10px] text-zinc-500">
                    {r.daysLeft < 0 ? `${-r.daysLeft} day(s) ago` : `in ${r.daysLeft} day(s)`}
                  </span>
                </td>
                <td className={cell}>
                  <StatusBadge status={r.state === "ACTIVE" ? "ACTIVE" : r.state} size="sm" />
                </td>
                {editable && (
                  <td className={`${cell} whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => setEditing(r.id)}
                      className="text-emerald-400 underline mr-3"
                      aria-label={`Edit ${r.item} batch ${r.batch}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          if (
                            !window.confirm(
                              `Remove ${r.item} (${r.batch}) from the list? History is kept.`
                            )
                          )
                            return;
                          const res = await archiveStockLineAction(r.id);
                          setMessage(res.ok ? null : res.message);
                        })
                      }
                      className="text-rose-300 underline"
                      aria-label={`Remove ${r.item} batch ${r.batch}`}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
