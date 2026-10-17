"use client";

import { useState, useTransition } from "react";
import { QrCode, FileText, Truck, Building2, CheckCircle2 } from "lucide-react";
import { decideRequestAction } from "@/app/(desk)/regulator/approvals/actions";
import { formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { toEthiopianDate } from "@/lib/ethiopian-calendar";
import { DisposalQrModal } from "./disposal-qr-modal";
import type { DisposalRequestRow } from "@/types/view-models";

/**
 * Medicine disposal requests (CLAUDE.md §12). With `canDecide` (Hospital Admin or EFDA officer) each waiting request gets
 * Approve and Reject (reason required); approval creates the pharmaceutical waste record and enables driver collection.
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
        const status = r.data.status as string;
        onDone(
          status === "PENDING_EFDA_APPROVAL"
            ? `${row.requestCode} approved by Hospital. Routed to EFDA for regulatory review due to expired medicine.`
            : status === "PENDING_DRIVER_ASSIGNMENT"
            ? `${row.requestCode} approved. Routed to Super Admin for driver assignment.`
            : status === "APPROVED"
            ? `${row.requestCode} approved. Driver collection pass active.`
            : `${row.requestCode} rejected.`
        );
      } else setMessage({ ok: false, text: r.message });
    });
  return (
    <div className="space-y-2 pt-2 border-t border-white/[0.06]">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run({ decision: "APPROVE" })}
          className="min-h-[38px] px-4 rounded-xl text-xs font-semibold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors"
        >
          Approve Request
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejecting((v) => !v)}
          className="min-h-[38px] px-4 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
        >
          Reject…
        </button>
      </div>
      {rejecting && (
        <div className="flex flex-wrap gap-2 pt-1">
          <input
            aria-label={`Reason for rejecting ${row.requestCode}`}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 min-w-[220px] min-h-[38px] bg-[#161622] border border-white/[0.1] rounded-xl px-3 text-xs text-zinc-100"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => run({ decision: "REJECT", reason })}
            className="min-h-[38px] px-4 rounded-xl text-xs font-semibold bg-rose-500 text-white disabled:opacity-50"
          >
            Confirm rejection
          </button>
        </div>
      )}
      {message && !message.ok && (
        <p role="alert" className="text-xs text-rose-300">
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
  const [activeQrRow, setActiveQrRow] = useState<DisposalRequestRow | null>(null);

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

      {activeQrRow && (
        <DisposalQrModal
          row={activeQrRow}
          open={Boolean(activeQrRow)}
          onClose={() => setActiveQrRow(null)}
        />
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 space-y-3 transition-colors hover:border-white/[0.12]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white">{r.requestCode}</span>
                  <StatusBadge status={r.status} size="sm" />
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {showFacility ? <strong className="text-zinc-200">{r.facility.name} · </strong> : ""}
                  requested by {r.requestedBy} · {formatDateTime(r.createdAt)}
                  {r.scheduledDate ? (
                    <span>
                      {" "}· Schedule: <strong className="text-zinc-200 font-mono">{r.scheduledDate}</strong>
                      {" "}<span className="text-emerald-400 font-semibold font-mono">({toEthiopianDate(r.scheduledDate).formattedAmharic})</span>
                    </span>
                  ) : ""} · {r.containerCount}{" "}
                  container(s), {r.weightKg} kg
                </p>
                {r.note && <p className="text-xs text-zinc-400 mt-0.5">Note: {r.note}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveQrRow(r)}
                  className="flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 border border-white/[0.08] transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  View QR Pass
                </button>
                {r.status === "DISPOSED" && (
                  <a
                    href={`/api/certificates/disposal/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download Certificate
                  </a>
                )}
                {r.wasteCode && (
                  <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
                    Waste: {r.wasteCode}
                  </span>
                )}
              </div>
            </div>

            {/* Medicines List */}
            <ul className="text-xs text-zinc-300 space-y-1 bg-[#161622]/60 p-2.5 rounded-xl border border-white/[0.04]">
              {r.lines.map((l) => (
                <li key={`${l.item}-${l.batch}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {l.item} {l.strength} {l.form && `(${l.form})`} · batch{" "}
                    <span className="font-mono text-zinc-200">{l.batch}</span>
                  </span>
                  <span className="text-zinc-400">
                    {l.quantity} {l.unit} · expiry {l.expiryDate}
                  </span>
                </li>
              ))}
            </ul>

            {/* Tracking Milestones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-zinc-400 block text-[11px]">Driver Collection</span>
                  {r.driverScannedAt ? (
                    <span className="text-emerald-400 font-medium">
                      Received by {r.driverName ?? "driver"} ({formatDateTime(r.driverScannedAt)})
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">Not scanned yet by driver</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-zinc-400 block text-[11px]">Disposal Facility</span>
                  {r.operatorScannedAt ? (
                    <span className="text-emerald-400 font-medium">
                      Received at facility ({formatDateTime(r.operatorScannedAt)})
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">Pending facility receipt</span>
                  )}
                </div>
              </div>
            </div>

            {r.status === "REJECTED" && r.decisionReason && (
              <p className="text-xs text-rose-300 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
                Rejected: {r.decisionReason}
              </p>
            )}

            {canDecide &&
              (r.status === "PENDING_APPROVAL" || r.status === "PENDING_EFDA_APPROVAL") && (
                <Decide row={r} onDone={setNotice} />
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}
