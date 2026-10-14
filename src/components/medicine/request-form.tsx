"use client";

import { useRef, useState, useTransition } from "react";
import { createDisposalRequestAction } from "@/app/(desk)/hospital/stock/actions";
import { FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StockRow } from "@/types/view-models";

/**
 * Medicine disposal request (CLAUDE.md §12): choose stock lines and quantities, plus containers and weight for the
 * waste record that an approval creates. Goes to the EFDA officer for approval.
 */
export function RequestForm({ stock }: { stock: StockRow[] }) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [containers, setContainers] = useState("1");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef(crypto.randomUUID());

  const lines = Object.entries(chosen).map(([stockId, quantity]) => ({ stockId, quantity }));
  const submit = () =>
    start(async () => {
      const r = await createDisposalRequestAction(
        { lines, containerCount: containers, weightKg: weight, note },
        key.current
      );
      if (r.ok) {
        setMessage({
          ok: true,
          text: `Request ${r.data.requestCode} sent to the EFDA officer for approval.`,
        });
        setChosen({});
        setWeight("");
        setNote("");
        key.current = crypto.randomUUID();
      } else {
        setMessage({ ok: false, text: r.message });
        key.current = crypto.randomUUID();
      }
    });

  if (stock.length === 0) {
    return <p className="text-sm text-zinc-400">There is no stock to request disposal for.</p>;
  }
  return (
    <section
      aria-label="New disposal request"
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold text-white">New disposal request</h3>
      <div className="max-h-96 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs text-zinc-300">
          <thead className="text-left text-zinc-500 sticky top-0 bg-[#111116]">
            <tr>
              <th className="px-2 py-1.5">Dispose</th>
              <th className="px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5">Batch</th>
              <th className="px-2 py-1.5">In stock</th>
              <th className="px-2 py-1.5">Expiry</th>
              <th className="px-2 py-1.5">Quantity to dispose</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => {
              const on = s.id in chosen;
              return (
                <tr key={s.id} className="border-t border-white/[0.05]">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      aria-label={`Dispose ${s.item} batch ${s.batch}`}
                      onChange={(e) =>
                        setChosen((c) => {
                          const next = { ...c };
                          if (e.target.checked) next[s.id] = String(s.quantity);
                          else delete next[s.id];
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-zinc-100">
                    {s.item} {s.strength}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{s.batch}</td>
                  <td className="px-2 py-1.5">
                    {s.quantity} {s.unit}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono">{s.expiryDate}</span>{" "}
                    {s.state !== "ACTIVE" && <StatusBadge status={s.state} size="sm" />}
                  </td>
                  <td className="px-2 py-1.5">
                    {on && (
                      <input
                        type="number"
                        min={1}
                        max={s.quantity}
                        aria-label={`Quantity of ${s.item} batch ${s.batch}`}
                        value={chosen[s.id]}
                        onChange={(e) => setChosen((c) => ({ ...c, [s.id]: e.target.value }))}
                        className={`${inputClass} w-28`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-400 space-y-1">
          <span className="block">Containers it will fill</span>
          <input
            type="number"
            min={1}
            value={containers}
            onChange={(e) => setContainers(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-zinc-400 space-y-1">
          <span className="block">Estimated weight (kg)</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-zinc-400 space-y-1">
          <span className="block">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </label>
      </div>
      {message && !message.ok && <FormError message={message.text} />}
      {message?.ok && (
        <p role="status" className="text-sm text-emerald-300">
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={pending || lines.length === 0 || !weight}
        onClick={submit}
        className={primaryButtonClass}
      >
        {pending
          ? "Sending…"
          : `Request disposal (${lines.length} line${lines.length === 1 ? "" : "s"})`}
      </button>
    </section>
  );
}
