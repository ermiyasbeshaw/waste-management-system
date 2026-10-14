"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import { EmptyState } from "@/components/shared/empty-state";
import type { ReadyWaste } from "@/types/view-models";

/**
 * Destruction (Gate 5.2): one record per waste — method and confirmation. Destruction locks the record for good and
 * starts the certificate. Waste of which nothing was received is closed without destruction (reason; no
 * certificate).
 */

type DestroyResult = {
  wasteCode: string;
  status: string;
  certificate: { certificateNo: string };
};

function WasteRow({ w, methods }: { w: ReadyWaste; methods: { code: string; name: string }[] }) {
  const router = useRouter();
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newIdempotencyKey());
  const closeOnly = w.receivedCount === 0;

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const r = closeOnly
      ? await postCommand<{ wasteCode: string }>(
          `/api/disposal/waste/${w.id}/close`,
          { reason },
          key.current
        )
      : await postCommand<DestroyResult>(
          `/api/disposal/waste/${w.id}/destroy`,
          { methodCode: method },
          key.current
        );
    setBusy(false);
    if (!r.ok) {
      setMessage({ ok: false, text: r.message });
      if (r.status !== 0) key.current = newIdempotencyKey();
      return;
    }
    setMessage({
      ok: true,
      text: closeOnly
        ? `${w.wasteCode} closed without destruction.`
        : `${w.wasteCode} destroyed. Certificate ${(r.data as DestroyResult).certificate.certificateNo} is being prepared.`,
    });
    setConfirming(false);
    router.refresh();
  };

  return (
    <li className="rounded-xl border border-white/[0.07] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-white">{w.wasteCode}</p>
          <p className="text-xs text-zinc-400">
            {w.facility.name} · {w.categoryName} · {w.weightKg} kg
          </p>
        </div>
        <p className="text-xs text-zinc-300">
          {w.receivedCount} received
          {w.exceptionCount > 0 && (
            <span className="text-rose-300"> · {w.exceptionCount} missing/refused</span>
          )}
        </p>
      </div>

      {closeOnly ? (
        <label className="block text-xs text-zinc-400">
          No container was received. Reason for closing without destruction (required)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full rounded-lg bg-[#161622] border border-white/[0.1] p-2 text-sm text-zinc-100"
          />
        </label>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Method
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="min-h-[40px] bg-[#161622] border border-white/[0.1] rounded-lg px-2 text-sm text-zinc-100"
          >
            {methods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-amber-300">
            {closeOnly
              ? "Close this waste without destruction? This cannot be undone."
              : `Destroy ${w.receivedCount} container(s)? This cannot be undone.`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="min-h-[44px] px-4 rounded-xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Saving…" : closeOnly ? "Yes, close" : "Yes, destroyed"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-sm text-zinc-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={closeOnly ? reason.trim().length < 3 : !method}
          onClick={() => setConfirming(true)}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
        >
          {closeOnly ? "Close without destruction" : "Record destruction"}
        </button>
      )}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

export function DestructionDesk({
  ready,
  methods,
}: {
  ready: ReadyWaste[];
  methods: { code: string; name: string }[];
}) {
  return (
    <section
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4"
      aria-label="Destruction"
    >
      <div>
        <h2 className="text-base font-semibold text-white">Ready for destruction</h2>
        <p className="text-xs text-zinc-400">
          Received waste. Destruction is recorded once per waste record and locks it; the
          certificate follows.
        </p>
      </div>
      {ready.length === 0 ? (
        <EmptyState title="Nothing to destroy" description="Received waste appears here." />
      ) : (
        <ul className="space-y-3">
          {ready.map((w) => (
            <WasteRow key={w.id} w={w} methods={methods} />
          ))}
        </ul>
      )}
    </section>
  );
}
