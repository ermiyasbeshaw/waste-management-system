"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";

/** Starts the driver's planned trip for today (licences and one-active-trip checked on the server). */
export function StartTripButton({ tripId, tripCode }: { tripId: string; tripCode: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    key.current ??= newIdempotencyKey();
    setBusy(true);
    setError(null);
    const r = await postCommand(`/api/trips/${tripId}/start`, {}, key.current);
    setBusy(false);
    if (r.status !== 0) key.current = null;
    if (r.ok) router.refresh();
    else setError(r.message);
  };

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-black text-base font-semibold disabled:opacity-50"
      >
        <Play className="w-5 h-5" aria-hidden="true" />
        {busy ? "Starting…" : `Start trip ${tripCode}`}
      </button>
    </div>
  );
}
