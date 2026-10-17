"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { previewStockAction, saveStockAction } from "@/app/(desk)/hospital/stock/actions";
import type { ImportPreview } from "@/lib/stock-import";

/**
 * Stock upload (CLAUDE.md §12): choose an Excel (.xlsx) or CSV file → preview with an error per row → save. Nothing
 * is saved while any row has an error; the user fixes the file and uploads again.
 */
export function StockUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setMessage(null);
    start(async () => {
      const form = new FormData();
      form.append("file", file);
      const r = await previewStockAction(form);
      if (r.ok) setPreview(r.data);
      else {
        setPreview(null);
        setMessage({ ok: false, text: r.message });
      }
    });
  };

  const save = () =>
    start(async () => {
      if (!preview) return;
      const lines = preview.rows.map((r) => r.line).filter((l) => l !== null);
      const r = await saveStockAction({ lines });
      if (r.ok) {
        setMessage({
          ok: true,
          text: `Successfully saved to database: ${r.data.created} new medicine(s) added, ${r.data.updated} updated.`,
        });
        setPreview(null);
        setFile(null);
        router.refresh();
      } else setMessage({ ok: false, text: r.message });
    });

  const canSave =
    preview !== null &&
    preview.fileErrors.length === 0 &&
    preview.errorCount === 0 &&
    preview.validCount > 0;

  return (
    <section
      aria-label="Upload stock"
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          Upload stock (Excel or CSV)
        </h3>
        <p className="text-xs text-zinc-400 mt-1">
          First row:{" "}
          <span className="font-mono">
            item, strength, form, batch, quantity, unit, expiry date
          </span>
          . Exactly these column names. Dates as 2027-03-31 or 31/03/2027. A batch that is already
          listed gets the new quantity and expiry date.
        </p>
      </div>
      <form onSubmit={check} className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-300">
          <span className="sr-only">Stock file</span>
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
            }}
            aria-label="Stock file"
            className="text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={!file || pending}
          className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-white/[0.08] text-zinc-100 disabled:opacity-50"
        >
          {pending && !preview ? "Checking…" : "Check file"}
        </button>
      </form>

      {preview && (
        <div className="space-y-3">
          {preview.fileErrors.map((e) => (
            <p key={e} role="alert" className="text-sm text-rose-300">
              {e}
            </p>
          ))}
          {preview.rows.length > 0 && (
            <>
              <p className="text-sm text-zinc-200">
                {preview.validCount} line(s) ready
                {preview.errorCount > 0 && (
                  <span className="text-rose-300">
                    {" "}
                    · {preview.errorCount} with errors — fix the file and check again
                  </span>
                )}
              </p>
              <div className="max-h-80 overflow-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-xs text-zinc-300">
                  <thead className="text-left text-zinc-500 sticky top-0 bg-[#111116]">
                    <tr>
                      <th className="px-2 py-1.5">Row</th>
                      <th className="px-2 py-1.5">Item</th>
                      <th className="px-2 py-1.5">Batch</th>
                      <th className="px-2 py-1.5">Quantity</th>
                      <th className="px-2 py-1.5">Expiry</th>
                      <th className="px-2 py-1.5">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-white/[0.05]">
                        <td className="px-2 py-1.5 font-mono">{r.row}</td>
                        <td className="px-2 py-1.5">
                          {r.values.item} {r.values.strength}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{r.values.batch}</td>
                        <td className="px-2 py-1.5">
                          {r.values.quantity} {r.values.unit}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{r.values.expiry_date}</td>
                        <td
                          className={`px-2 py-1.5 ${r.errors.length ? "text-rose-300" : "text-emerald-300"}`}
                        >
                          {r.errors.length ? r.errors.join("; ") : "OK"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={save}
            className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-emerald-500 text-black disabled:opacity-50"
          >
            {pending ? "Saving…" : `Save ${preview.validCount} line(s)`}
          </button>
        </div>
      )}
      {message && (
        <div
          role={message.ok ? "status" : "alert"}
          className={`p-4 rounded-xl text-xs space-y-2.5 ${
            message.ok
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            {message.ok ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Inventory Saved to Database</span>
              </>
            ) : (
              <span>Import Error</span>
            )}
          </div>
          <p>{message.text}</p>
          {message.ok && (
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <span className="text-zinc-400">
                All saved medicines are now viewable and selectable on the Disposal Requests page.
              </span>
              <Link
                href="/hospital/stock/requests"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-colors shadow"
              >
                <span>Go to Disposal Requests</span>
                <span>→</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
