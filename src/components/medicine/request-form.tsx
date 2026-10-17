"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Search, CheckSquare, Square, Filter, PackageCheck, AlertTriangle } from "lucide-react";
import { createDisposalRequestAction } from "@/app/(desk)/hospital/stock/actions";
import { FormError, inputClass, primaryButtonClass } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { EthiopianDatePicker } from "@/components/shared/ethiopian-date-picker";
import type { StockRow } from "@/types/view-models";

/**
 * Medicine disposal request (CLAUDE.md §12): choose stock lines and quantities, plus containers and weight for the
 * waste record that an approval creates. Initiated by hospital staff and forwarded to hospital administrator.
 */
export function RequestForm({ stock }: { stock: StockRow[] }) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const today = new Date().toISOString().split("T")[0];
  const [containers, setContainers] = useState("1");
  const [weight, setWeight] = useState("");
  const [scheduledDate, setScheduledDate] = useState(today);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "expired" | "expiring" | "selected">("all");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = useRef(crypto.randomUUID());

  // Filtered medicines based on search query and category tab
  const filteredStock = useMemo(() => {
    return stock.filter((s) => {
      // Category filter
      if (filter === "expired" && s.state !== "EXPIRED") return false;
      if (filter === "expiring" && s.state !== "EXPIRING_SOON") return false;
      if (filter === "selected" && !(s.id in chosen)) return false;

      // Text search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.item.toLowerCase().includes(q) ||
        (s.strength && s.strength.toLowerCase().includes(q)) ||
        s.batch.toLowerCase().includes(q) ||
        (s.form && s.form.toLowerCase().includes(q))
      );
    });
  }, [stock, filter, search, chosen]);

  const expiredCount = useMemo(() => stock.filter((s) => s.state === "EXPIRED").length, [stock]);
  const expiringCount = useMemo(() => stock.filter((s) => s.state === "EXPIRING_SOON").length, [stock]);
  const lines = Object.entries(chosen).map(([stockId, quantity]) => ({ stockId, quantity }));

  // Bulk actions
  const selectAllFiltered = () => {
    setChosen((prev) => {
      const next = { ...prev };
      for (const s of filteredStock) {
        next[s.id] = String(s.quantity);
      }
      return next;
    });
  };

  const clearAllFiltered = () => {
    setChosen((prev) => {
      const next = { ...prev };
      for (const s of filteredStock) {
        delete next[s.id];
      }
      return next;
    });
  };

  const submit = () =>
    start(async () => {
      const r = await createDisposalRequestAction(
        { lines, containerCount: containers, weightKg: weight, scheduledDate, note },
        key.current
      );
      if (r.ok) {
        setMessage({
          ok: true,
          text: `Disposal Request ${r.data.requestCode} created successfully and sent to Hospital Administrator for approval with proposed date (${scheduledDate}).`,
        });
        setChosen({});
        setWeight("");
        setScheduledDate(today);
        setNote("");
        key.current = crypto.randomUUID();
      } else {
        setMessage({ ok: false, text: r.message });
        key.current = crypto.randomUUID();
      }
    });

  if (stock.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-6 text-center space-y-2">
        <p className="text-sm font-semibold text-white">No medicine stock found in facility</p>
        <p className="text-xs text-zinc-400">
          Upload your medicine inventory on the Medicine Stock page first, and all imported medicines will be displayed here for disposal.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="New disposal request"
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            New Medicine Disposal Request
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Select medicines from your facility stock to request disposal. Reviewable by Hospital Admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            {lines.length} medicine{lines.length === 1 ? "" : "s"} selected
          </span>
        </div>
      </div>

      {/* Stock Filter Bar & Search */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search all stock by medicine name, batch, strength…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#161622] border border-white/[0.1] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 bg-[#161622] p-1 rounded-xl border border-white/[0.08] text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === "all" ? "bg-emerald-500 text-black font-bold" : "text-zinc-400 hover:text-white"
              }`}
            >
              All ({stock.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("expired")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                filter === "expired" ? "bg-rose-500 text-white font-bold" : "text-zinc-400 hover:text-rose-300"
              }`}
            >
              Expired ({expiredCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("expiring")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === "expiring" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-amber-300"
              }`}
            >
              Expiring ({expiringCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("selected")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === "selected" ? "bg-cyan-500 text-black font-bold" : "text-zinc-400 hover:text-cyan-300"
              }`}
            >
              Selected ({lines.length})
            </button>
          </div>
        </div>

        {/* Bulk Selection Controls */}
        <div className="flex flex-wrap items-center justify-between text-xs text-zinc-400 pt-1">
          <span>
            Showing <strong className="text-zinc-200">{filteredStock.length}</strong> of {stock.length} medicines in facility stock
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Select all visible ({filteredStock.length})
            </button>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              onClick={clearAllFiltered}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 hover:underline"
            >
              <Square className="w-3.5 h-3.5" />
              Clear visible
            </button>
          </div>
        </div>
      </div>

      {/* Stock Selection Table */}
      <div className="max-h-96 overflow-auto rounded-xl border border-white/[0.08] bg-[#0c0c10]">
        <table className="w-full text-xs text-zinc-300">
          <thead className="text-left text-zinc-400 sticky top-0 bg-[#14141c] border-b border-white/[0.06] z-10">
            <tr>
              <th className="px-3 py-2 w-10">Select</th>
              <th className="px-3 py-2">Medicine / Strength</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">In Stock</th>
              <th className="px-3 py-2">Expiry Date</th>
              <th className="px-3 py-2">Quantity to Dispose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filteredStock.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No medicines match your current search or category filter.
                </td>
              </tr>
            ) : (
              filteredStock.map((s) => {
                const on = s.id in chosen;
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      on ? "bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <td className="px-3 py-2.5">
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
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500/20 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-zinc-100">
                      <div className="font-semibold text-white">{s.item}</div>
                      <div className="text-[11px] text-zinc-400">
                        {s.strength} {s.form && `· ${s.form}`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-300">{s.batch}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-white">{s.quantity}</span>{" "}
                      <span className="text-zinc-400">{s.unit}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-zinc-300">{s.expiryDate}</span>
                        {s.state !== "ACTIVE" && <StatusBadge status={s.state} size="sm" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {on ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={s.quantity}
                            aria-label={`Quantity of ${s.item} batch ${s.batch}`}
                            value={chosen[s.id]}
                            onChange={(e) => setChosen((c) => ({ ...c, [s.id]: e.target.value }))}
                            className="w-24 bg-[#181924] border border-emerald-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-400"
                          />
                          <span className="text-zinc-500 text-[11px]">{s.unit}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 italic">Not selected</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Disposal Manifest & Scheduling Details */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
        <label className="text-xs text-zinc-300 space-y-1.5">
          <span className="block font-medium">Containers it will fill</span>
          <input
            type="number"
            min={1}
            value={containers}
            onChange={(e) => setContainers(e.target.value)}
            className={inputClass}
            placeholder="1"
          />
        </label>

        <label className="text-xs text-zinc-300 space-y-1.5">
          <span className="block font-medium">Estimated weight (kg)</span>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputClass}
            placeholder="e.g. 25.5"
          />
        </label>

        {/* Dual Ethiopian & Gregorian Date Selector with Full Visibility */}
        <div className="sm:col-span-1">
          <EthiopianDatePicker
            value={scheduledDate}
            onChange={setScheduledDate}
            label="Proposed Date / Schedule"
          />
        </div>

        <label className="text-xs text-zinc-300 space-y-1.5">
          <span className="block font-medium">Note / Instructions (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Reason or handling notes"
          />
        </label>
      </div>

      {message && !message.ok && <FormError message={message.text} />}
      {message?.ok && (
        <div
          role="status"
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium space-y-1"
        >
          <p>{message.text}</p>
          <p className="text-zinc-400 text-[11px]">
            The request has been saved and routed to the Hospital Administrator overview station for approval.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={pending || lines.length === 0 || !weight}
        onClick={submit}
        className={`${primaryButtonClass} w-full sm:w-auto min-h-[44px] px-6 text-sm font-semibold`}
      >
        {pending
          ? "Submitting Request…"
          : `Request Disposal (${lines.length} medicine line${lines.length === 1 ? "" : "s"})`}
      </button>
    </section>
  );
}

