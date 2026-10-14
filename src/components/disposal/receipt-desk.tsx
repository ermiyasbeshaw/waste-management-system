"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import { Scanner } from "@/components/driver/scanner";
import { EmptyState } from "@/components/shared/empty-state";
import type { OnBoardContainer } from "@/types/view-models";

/**
 * Receipt at the site (Gate 5.1): scan or type each container from the truck → RECEIVED. A container that is not
 * on the truck is marked MISSING, one that fails inspection REFUSED — both need a written reason.
 */

type ReceiptResult = {
  containerCode: string;
  wasteCode: string;
  wasteStatus: string;
  remaining: number;
  tripCompleted: boolean;
};

const describe = (r: ReceiptResult) =>
  `Received · ${r.wasteCode}: ${r.remaining === 0 ? "all checked in" : `${r.remaining} still on the truck`}` +
  (r.tripCompleted ? " · trip completed" : "");

function ExceptionForm({ code, onDone }: { code: string; onDone: (message: string) => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"MISSING" | "REFUSED">("MISSING");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await postCommand<ReceiptResult>(
      "/api/disposal/exception",
      { containerCode: code, kind, reason },
      key.current
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      if (r.status !== 0) key.current = newIdempotencyKey();
      return;
    }
    onDone(`${code} marked ${kind.toLowerCase()}`);
    router.refresh();
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
      <fieldset className="flex gap-4 text-sm text-zinc-200">
        <legend className="sr-only">Exception</legend>
        {(["MISSING", "REFUSED"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`kind-${code}`}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {k === "MISSING" ? "Missing (not on the truck)" : "Refused (failed inspection)"}
          </label>
        ))}
      </fieldset>
      <label className="block text-xs text-zinc-400">
        Reason (required)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-lg bg-[#161622] border border-white/[0.1] p-2 text-sm text-zinc-100"
        />
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
        className="min-h-[44px] px-4 rounded-xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Saving…" : `Mark ${kind.toLowerCase()}`}
      </button>
    </div>
  );
}

export function ReceiptDesk({ onBoard }: { onBoard: OnBoardContainer[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const trips = Array.from(new Set(onBoard.map((c) => c.tripCode)));

  return (
    <section
      className="bg-[#111116] border border-white/[0.07] rounded-2xl p-5 space-y-4"
      aria-label="Receipt"
    >
      <div>
        <h2 className="text-base font-semibold text-white">Check in containers</h2>
        <p className="text-xs text-zinc-400">
          Scan every container from the truck. The waste is received when all its containers are
          checked in.
        </p>
      </div>
      <Scanner<ReceiptResult>
        stopId="disposal-receipt"
        url="/api/disposal/receive"
        describe={describe}
        onScanned={() => router.refresh()}
      />
      {notice && (
        <p aria-live="polite" className="text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {onBoard.length === 0 ? (
        <EmptyState
          title="Nothing on the trucks"
          description="Every collected container is checked in."
        />
      ) : (
        trips.map((trip) => {
          const rows = onBoard.filter((c) => c.tripCode === trip);
          return (
            <div key={trip} className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">
                <span className="font-mono">{trip}</span> · {rows[0].vehiclePlate} · {rows.length}{" "}
                on board
              </h3>
              <ul className="space-y-2">
                {rows.map((c) => (
                  <li key={c.containerCode} className="rounded-xl border border-white/[0.06] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-white break-all">{c.containerCode}</p>
                        <p className="text-xs text-zinc-400">{c.facilityName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(open === c.containerCode ? null : c.containerCode)}
                        className="min-h-[40px] px-3 rounded-lg bg-white/[0.06] border border-white/[0.1] text-xs text-zinc-200"
                      >
                        {open === c.containerCode ? "Close" : "Missing / refused…"}
                      </button>
                    </div>
                    {open === c.containerCode && (
                      <ExceptionForm
                        code={c.containerCode}
                        onDone={(m) => {
                          setOpen(null);
                          setNotice(m);
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
