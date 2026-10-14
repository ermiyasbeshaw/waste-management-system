"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCertificateJobAction } from "@/app/(desk)/admin/certificates/actions";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { AdminCertificateRow } from "@/types/view-models";

/**
 * Certificates for the Super Administrator (CLAUDE.md §3 / §5): revoke an ISSUED certificate with a reason —
 * optionally reissue (a new certificate; the old one stays REVOKED) — and run the generation job for PENDING /
 * FAILED certificates. The waste status never changes here.
 */

function RevokeForm({ row, onDone }: { row: AdminCertificateRow; onDone: (text: string) => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await postCommand<{ reissued: { certificateNo: string } | null }>(
      `/api/certificates/${row.id}/revoke`,
      { reason, reissue },
      key.current
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      if (r.status !== 0) key.current = newIdempotencyKey();
      return;
    }
    onDone(
      r.data.reissued
        ? `${row.certificateNo} revoked. New certificate ${r.data.reissued.certificateNo} is being prepared.`
        : `${row.certificateNo} revoked.`
    );
    router.refresh();
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
      <label className="block text-xs text-zinc-400">
        Reason for revoking (required)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-lg bg-[#161622] border border-white/[0.1] p-2 text-sm text-zinc-100"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" checked={reissue} onChange={(e) => setReissue(e.target.checked)} />
        Issue a new certificate for the same destruction
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={submit}
        className="min-h-[40px] px-4 rounded-xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Saving…" : "Revoke"}
      </button>
    </div>
  );
}

export function CertificatesAdmin({ rows }: { rows: AdminCertificateRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const waiting = rows.filter((r) => r.status === "PENDING" || r.status === "FAILED").length;

  const runJob = () =>
    startTransition(async () => {
      const r = await runCertificateJobAction();
      setNotice(
        r.ok
          ? { ok: true, text: `Job done: ${r.data.issued} issued, ${r.data.failed} failed.` }
          : { ok: false, text: r.message }
      );
      router.refresh();
    });

  return (
    <section className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Certificates of Disposal</h2>
          <p className="text-xs text-zinc-400">
            {waiting} waiting for generation or retry. Revoking never changes the waste status.
          </p>
        </div>
        <button
          type="button"
          onClick={runJob}
          disabled={pending || waiting === 0}
          className="min-h-[40px] px-4 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Running…" : "Generate / retry now"}
        </button>
      </div>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={notice.ok ? "text-sm text-emerald-300" : "text-sm text-rose-300"}
        >
          {notice.text}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No certificates yet" />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {rows.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-white">
                    {c.certificateNo} <StatusBadge status={c.status} size="sm" />
                  </p>
                  <p className="text-xs text-zinc-400">
                    {c.facilityName} · {c.wasteCode}
                    {c.issuedOn ? ` · issued ${c.issuedOn}` : ""}
                  </p>
                  {c.status === "FAILED" && (
                    <p className="text-xs text-rose-300">
                      Attempt {c.attempts} failed{c.lastError ? `: ${c.lastError}` : ""}
                    </p>
                  )}
                  {c.revokedReason && (
                    <p className="text-xs text-zinc-500">Revoked: {c.revokedReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {(c.status === "ISSUED" || c.status === "REVOKED") && (
                    <a
                      href={`/api/certificates/${c.id}/pdf`}
                      className="text-xs text-emerald-400 underline"
                    >
                      Download
                    </a>
                  )}
                  {c.status === "ISSUED" && (
                    <button
                      type="button"
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                      className="min-h-[36px] px-3 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-zinc-200"
                    >
                      {open === c.id ? "Close" : "Revoke…"}
                    </button>
                  )}
                </div>
              </div>
              {open === c.id && (
                <RevokeForm
                  row={c}
                  onDone={(text) => {
                    setOpen(null);
                    setNotice({ ok: true, text });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
