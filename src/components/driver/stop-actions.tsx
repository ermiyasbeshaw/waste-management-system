"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MapPinCheck, RotateCcw, SkipForward } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";
import type { StopCard } from "@/types/view-models";
import { Scanner } from "./scanner";

const big =
  "w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl text-base font-semibold disabled:opacity-50";

/**
 * Driver actions for one stop of the active trip (mobile, one column): Arrived → scan every container → enter the
 * pickup code (or the hospital confirms in the app) → done. Skip with a reason at any point before completion.
 * Each intended action keeps its idempotency key until it succeeds or is refused, so double taps run once.
 */
export function StopActions({
  stop,
  anotherStopOpen,
}: {
  stop: StopCard;
  anotherStopOpen: boolean;
}) {
  const router = useRouter();
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState({
    scanned: stop.scannedContainers,
    expected: stop.expectedContainers,
  });
  const [code, setCode] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");

  const run = async <T,>(action: string, url: string, body: unknown, onOk?: (data: T) => void) => {
    if (!keys.current.has(action)) keys.current.set(action, newIdempotencyKey());
    setBusy(action);
    setError(null);
    setInfo(null);
    const r = await postCommand<T>(url, body, keys.current.get(action));
    setBusy(null);
    if (r.status !== 0) keys.current.delete(action); // keep the key only for a retry after a network failure
    if (r.ok) {
      onOk?.(r.data);
      router.refresh();
    } else {
      setError(r.message);
      if (r.code === "OTP_INVALID" || r.code === "OTP_LOCKED" || r.code === "OTP_EXPIRED")
        router.refresh();
    }
    return r;
  };

  if (stop.status === "PENDING") {
    return (
      <div className="space-y-2">
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy !== null || anotherStopOpen}
          onClick={() =>
            run<{ otpIssued: boolean; geofenceOk: boolean | null; distanceM: number | null }>(
              "arrive",
              `/api/stops/${stop.id}/arrive`,
              {}
            )
          }
          className={`${big} bg-amber-500 text-black`}
        >
          <MapPinCheck className="w-5 h-5" aria-hidden="true" />
          {busy === "arrive" ? "Marking arrival…" : "I have arrived"}
        </button>
        {anotherStopOpen && (
          <p className="text-xs text-zinc-500">Finish or skip the stop you are at first.</p>
        )}
        <SkipControl
          {...{ skipping, setSkipping, reason, setReason, busy }}
          onSkip={() => run("skip", `/api/stops/${stop.id}/skip`, { reason })}
        />
      </div>
    );
  }

  if (stop.status !== "ARRIVED") return null;

  const complete = progress.expected > 0 && progress.scanned >= progress.expected;

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run("verify", `/api/stops/${stop.id}/verify-otp`, { code }, () => setCode(""));
  };

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3"
        >
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="text-sm text-emerald-300">
          {info}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">
          1. Scan every container —{" "}
          <span className={complete ? "text-emerald-400" : "text-amber-300"}>
            {progress.scanned} of {progress.expected}
          </span>
        </p>
        <Scanner
          stopId={stop.id}
          onScanned={(p) => {
            setProgress(p);
            router.refresh();
          }}
        />
      </div>

      <form onSubmit={verify} className="space-y-2">
        <label htmlFor={`otp-${stop.id}`} className="block text-sm font-semibold text-white">
          2. Pickup code from the hospital
        </label>
        <p className="text-xs text-zinc-400">
          {stop.otpExpiresAt
            ? `Sent by SMS to the hospital — valid until ${formatTime(stop.otpExpiresAt)}.`
            : "No active code. Send a new one, or ask the hospital to confirm in their app."}
        </p>
        <div className="flex gap-2">
          <input
            id={`otp-${stop.id}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="flex-1 min-w-0 min-h-[52px] bg-[#161622] text-xl tracking-[0.4em] text-center text-white border border-white/[0.1] rounded-xl font-mono"
            placeholder="••••••"
          />
          <button
            type="submit"
            disabled={busy !== null || code.length !== 6 || !complete}
            className="min-h-[52px] px-4 rounded-xl bg-emerald-500 text-black font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            <KeyRound className="w-5 h-5" aria-hidden="true" />
            Confirm
          </button>
        </div>
        {!complete && (
          <p className="text-xs text-zinc-500">
            The code works only after every container is scanned.
          </p>
        )}
      </form>

      <button
        type="button"
        disabled={busy !== null}
        onClick={() =>
          run<{ otpExpiresAt: string }>("resend", `/api/stops/${stop.id}/resend-otp`, {}, () =>
            setInfo("A new code was sent to the hospital.")
          )
        }
        className={`${big} bg-white/[0.06] border border-white/[0.1] text-zinc-100`}
      >
        <RotateCcw className="w-5 h-5" aria-hidden="true" />
        {busy === "resend" ? "Sending…" : "Send a new code"}
      </button>

      <SkipControl
        {...{ skipping, setSkipping, reason, setReason, busy }}
        onSkip={() => run("skip", `/api/stops/${stop.id}/skip`, { reason })}
      />
    </div>
  );
}

function SkipControl({
  skipping,
  setSkipping,
  reason,
  setReason,
  busy,
  onSkip,
}: {
  skipping: boolean;
  setSkipping: (v: boolean) => void;
  reason: string;
  setReason: (v: string) => void;
  busy: string | null;
  onSkip: () => void;
}) {
  if (!skipping) {
    return (
      <button
        type="button"
        onClick={() => setSkipping(true)}
        className={`${big} bg-rose-500/10 border border-rose-500/30 text-rose-300`}
      >
        <SkipForward className="w-5 h-5" aria-hidden="true" />
        Skip this stop…
      </button>
    );
  }
  return (
    <div className="space-y-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
      <label htmlFor="skip-reason" className="block text-sm font-semibold text-rose-200">
        Why can this stop not be collected?
      </label>
      <textarea
        id="skip-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full bg-[#161622] text-base text-zinc-100 border border-white/[0.1] rounded-xl p-2"
      />
      <p className="text-xs text-zinc-400">
        Scans are cancelled and the waste goes back on the waiting list.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null || reason.trim().length < 3}
          onClick={onSkip}
          className="flex-1 min-h-[48px] rounded-xl bg-rose-500 text-white font-semibold disabled:opacity-50"
        >
          {busy === "skip" ? "Skipping…" : "Skip stop"}
        </button>
        <button
          type="button"
          onClick={() => setSkipping(false)}
          className="min-h-[48px] px-4 rounded-xl bg-white/[0.06] text-zinc-200"
        >
          Back
        </button>
      </div>
    </div>
  );
}
