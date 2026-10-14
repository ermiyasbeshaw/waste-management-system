"use client";

import { useState, useTransition } from "react";
import { decideRequestAction } from "@/app/(desk)/regulator/approvals/actions";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { DisposalRequestRow } from "@/types/view-models";

/**
 * Medicine disposal requests (CLAUDE.md §12). With `canDecide` (EFDA officer only) each waiting request gets
 * Approve and Reject (reason required); approval creates the pharmaceutical waste record.
 */

function Decide({ row, onDone }: { row: DisposalRequestRow; onDone: (text: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (input: unknown) =>
    start(async () => {
      const r = await decideRequestAction(row.id, input);
      if (r.ok) {
        // Shown by the list: after the refresh this request is no longer waiting, so these buttons disappear.
        onDone(
          r.data.status === "APPROVED"
            ? `${row.requestCode} approved. Waste ${r.data.wasteCode} is on the facility's waiting list.`
            : `${row.requestCode} rejected.`
        );
      } else setMessage({ ok: false, text: r.message });
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run({ decision: "APPROVE" })}
          className="min-h-[40px] px-4 rounded-xl text-sm font-semibold bg-emerald-500 text-black disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejecting((v) => !v)}
          className="min-h-[40px] px-4 rounded-xl text-sm font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30"
        >
          Reject…
        </button>
      </div>
      {rejecting && (
        <div className="flex flex-wrap gap-2">
          <input
            aria-label={`Reason for rejecting ${row.requestCode}`}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 min-w-[220px] min-h-[40px] bg-[#161622] border border-white/[0.1] rounded-xl px-3 text-sm text-zinc-100"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => run({ decision: "REJECT", reason })}
            className="min-h-[40px] px-4 rounded-xl text-sm font-semibold bg-rose-500 text-white disabled:opacity-50"
          >
            Confirm rejection
          </button>
        </div>
      )}
      {message && !message.ok && (
        <p role="alert" className="text-sm text-rose-300">
          {message.text}
        </p>
      )}
    </div>
  );
}

export function RequestsList({
  rows,
  canDecide,
  showFacility,
}: {
  rows: DisposalRequestRow[];
  canDecide: boolean;
  showFacility: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  if (rows.length === 0) return <EmptyState title="No disposal requests" />;
  return (
    <div className="space-y-3">
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3"
        >
          {notice}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm text-white">
                  {r.requestCode} <StatusBadge status={r.status} size="sm" />
                </p>
                <p className="text-xs text-zinc-400">
                  {showFacility ? `${r.facility.name} · ` : ""}
                  requested by {r.requestedBy} · {formatDateTime(r.createdAt)} · {r.containerCount}{" "}
                  container(s), {r.weightKg} kg
                </p>
                {r.note && <p className="text-xs text-zinc-400">Note: {r.note}</p>}
              </div>
              {r.wasteCode && (
                <p className="text-xs text-emerald-300">
                  Waste ID <span className="font-mono">{r.wasteCode}</span>
                </p>
              )}
            </div>
            <ul className="text-xs text-zinc-300 space-y-0.5">
              {r.lines.map((l) => (
                <li key={`${l.item}-${l.batch}`}>
                  {l.item} {l.strength} {l.form && `(${l.form})`} · batch{" "}
                  <span className="font-mono">{l.batch}</span> · {l.quantity} {l.unit} · expiry{" "}
                  {l.expiryDate}
                </li>
              ))}
            </ul>
            {r.status === "REJECTED" && r.decisionReason && (
              <p className="text-xs text-rose-300">Rejected: {r.decisionReason}</p>
            )}
            {canDecide && r.status === "PENDING_APPROVAL" && <Decide row={r} onDone={setNotice} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
