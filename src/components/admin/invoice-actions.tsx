"use client";

import { useState, useTransition } from "react";
import {
  cancelInvoiceAction,
  issueInvoiceAction,
  runMonthlyInvoicesAction,
  settleInvoiceAction,
} from "@/app/(desk)/admin/finance/actions";
import { toEatDateString } from "@/lib/dates";
import { inputClass, primaryButtonClass } from "@/components/shared/form-field";
import type { InvoiceRow } from "@/types/view-models";

/**
 * Invoice actions for the Super Administrator (CLAUDE.md §5): DRAFT → ISSUED (due date stored) → SETTLED_OFFLINE
 * (payment reference + date); DRAFT / ISSUED → CANCELLED (reason). No payment gateway.
 */

const small = "min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold";

export function InvoiceActions({ invoice }: { invoice: InvoiceRow }) {
  const [mode, setMode] = useState<"none" | "settle" | "cancel">("none");
  const [reference, setReference] = useState("");
  const [settledOn, setSettledOn] = useState(() => toEatDateString(new Date()));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message ?? "Failed" });
      if (r.ok) setMode("none");
    });

  const canCancel = invoice.status === "DRAFT" || invoice.status === "ISSUED";
  return (
    <div className="space-y-1.5 min-w-[180px]">
      <div className="flex flex-wrap gap-1.5">
        <a
          href={`/api/invoices/${invoice.id}/pdf`}
          className={`${small} inline-flex items-center bg-white/[0.06] text-zinc-200`}
        >
          PDF
        </a>
        {invoice.status === "DRAFT" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => issueInvoiceAction(invoice.id), "Issued")}
            className={`${small} bg-emerald-500 text-black disabled:opacity-50`}
          >
            Issue
          </button>
        )}
        {invoice.status === "ISSUED" && (
          <button
            type="button"
            onClick={() => setMode(mode === "settle" ? "none" : "settle")}
            className={`${small} bg-sky-500/20 text-sky-200`}
          >
            Record payment
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}
            className={`${small} bg-rose-500/15 text-rose-300`}
          >
            Cancel
          </button>
        )}
      </div>
      {mode === "settle" && (
        <div className="space-y-1.5">
          <input
            aria-label="Payment reference"
            placeholder="Payment reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
          />
          <input
            aria-label="Payment date"
            type="date"
            value={settledOn}
            onChange={(e) => setSettledOn(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            disabled={pending || reference.trim().length < 2}
            onClick={() =>
              run(
                () => settleInvoiceAction(invoice.id, { reference, settledOn }),
                "Payment recorded"
              )
            }
            className={`${small} bg-sky-500 text-black disabled:opacity-50`}
          >
            Save payment
          </button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="space-y-1.5">
          <input
            aria-label="Reason for cancelling"
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => run(() => cancelInvoiceAction(invoice.id, { reason }), "Cancelled")}
            className={`${small} bg-rose-500 text-white disabled:opacity-50`}
          >
            Cancel invoice
          </button>
        </div>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Create the drafts of a month now (the scheduled job does the previous month automatically). */
export function MonthlyInvoicesPanel() {
  const [month, setMonth] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3 bg-[#111116] border border-white/[0.07] rounded-2xl p-4">
      <label className="text-xs text-zinc-400 space-y-1">
        <span className="block">Month (empty = previous month)</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={`${inputClass} w-44`}
        />
      </label>
      <button
        type="button"
        disabled={pending}
        className={primaryButtonClass}
        onClick={() =>
          start(async () => {
            const r = await runMonthlyInvoicesAction(month ? { month } : {});
            setMessage(
              r.ok
                ? {
                    ok: true,
                    text: `${r.data.month}: ${r.data.created} draft(s) created, ${r.data.skipped} already existed.`,
                  }
                : { ok: false, text: r.message }
            );
          })
        }
      >
        {pending ? "Creating…" : "Create monthly drafts"}
      </button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
