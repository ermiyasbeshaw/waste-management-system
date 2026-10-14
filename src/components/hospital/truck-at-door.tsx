"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Truck } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import type { ActiveHandover } from "@/types/view-models";

const POLL_MS = 10_000;

/**
 * "Truck at the door" (CLAUDE.md §6): polls every 10 s while the tab is visible. A hospital user of this facility
 * can confirm the handover in the app (fallback when the SMS code does not arrive); the server re-checks that
 * every container is scanned (no partial pickup).
 */
export function TruckAtDoor() {
  const router = useRouter();
  const [items, setItems] = useState<ActiveHandover[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ stopId: string; text: string; ok: boolean } | null>(
    null
  );
  const keys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital/active-handover", { cache: "no-store" });
      if (res.ok) setItems(((await res.json()) as { handovers: ActiveHandover[] }).handovers);
    } catch {
      /* keep the last known state; the next poll retries */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const confirm = async (stopId: string) => {
    if (!keys.current.has(stopId)) keys.current.set(stopId, newIdempotencyKey());
    setBusy(stopId);
    setMessage(null);
    const r = await postCommand(
      `/api/stops/${stopId}/confirm-handover`,
      {},
      keys.current.get(stopId)
    );
    setBusy(null);
    if (r.ok) {
      keys.current.delete(stopId);
      setMessage({ stopId, ok: true, text: "Handover confirmed. The waste is now in transit." });
      await load();
      router.refresh();
    } else {
      if (r.status !== 0) keys.current.delete(stopId); // a real refusal: a new attempt is a new action
      setMessage({ stopId, ok: false, text: r.message });
    }
  };

  if (items.length === 0 && !message) return null;

  return (
    <section aria-live="polite" className="space-y-3">
      {message?.ok && (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {message.text}
        </p>
      )}
      {items.map((h) => {
        const complete = h.expectedContainers > 0 && h.scannedContainers === h.expectedContainers;
        return (
          <article
            key={h.stopId}
            className="bg-[#10161f] border border-blue-500/40 rounded-2xl p-5 space-y-3 shadow-glow"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30">
                <Truck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Truck at the door</h2>
                <p className="text-sm text-zinc-300">
                  {h.vehiclePlate} · {h.driverName} · trip {h.tripCode} · arrived{" "}
                  {formatTime(h.arrivedAt)}
                </p>
              </div>
            </div>
            <p className="text-sm text-zinc-200">
              Containers scanned:{" "}
              <strong className={complete ? "text-emerald-400" : "text-amber-300"}>
                {h.scannedContainers} of {h.expectedContainers}
              </strong>
              {h.otpActive && h.otpExpiresAt && (
                <span className="text-zinc-400">
                  {" "}
                  · a pickup code was sent by SMS (valid until {formatTime(h.otpExpiresAt)})
                </span>
              )}
            </p>
            {message && !message.ok && message.stopId === h.stopId && (
              <p role="alert" className="text-sm text-rose-300">
                {message.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => confirm(h.stopId)}
                disabled={busy === h.stopId || !complete}
                className="min-h-[48px] px-5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white"
              >
                {busy === h.stopId ? "Confirming…" : "Confirm handover in the app"}
              </button>
              {!complete && (
                <span className="text-xs text-zinc-400">
                  Available when the driver has scanned every container.
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Give the driver the SMS code, or confirm here if the code did not arrive. Confirm only
              after you have handed over every container.
            </p>
          </article>
        );
      })}
    </section>
  );
}
