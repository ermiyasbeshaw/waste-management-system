"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { newIdempotencyKey, postCommand } from "@/lib/client/command";

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const CODE = /^WR-\d{4}-\d{5}-C\d{2,3}$/;

/**
 * Container QR scanner (CLAUDE.md §6): the camera reads the QR (container code only) with the browser's
 * BarcodeDetector where available; typing the code always works as a fallback. Every scan is one idempotent
 * command — evidence only, it never completes the pickup.
 */
type ScanProgress = { scanned: number; expected: number };

export function Scanner<T = ScanProgress>({
  stopId,
  onScanned,
  url,
  describe,
}: {
  /** Pickup stop; also names the input. The disposal desk passes its own id with `url`. */
  stopId: string;
  onScanned: (result: T) => void;
  /** Command URL; default: the stop's scan endpoint. */
  url?: string;
  /** Text shown after a successful scan; default "Scanned (x of n)". */
  describe?: (result: T) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recent = useRef(new Map<string, number>());
  const [cameraOn, setCameraOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const [manual, setManual] = useState("");
  const [log, setLog] = useState<{ code: string; ok: boolean; text: string }[]>([]);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices
    );
  }, []);

  const send = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!CODE.test(code)) {
      setLog((l) => [{ code: raw, ok: false, text: "Not a container code" }, ...l].slice(0, 6));
      return;
    }
    const last = recent.current.get(code);
    if (last && Date.now() - last < 4000) return; // the camera sees the same QR many times a second
    recent.current.set(code, Date.now());
    const r = await postCommand<T>(
      url ?? `/api/stops/${stopId}/scan`,
      { containerCode: code },
      newIdempotencyKey()
    );
    if (r.ok) {
      const text = describe
        ? describe(r.data)
        : `Scanned (${(r.data as ScanProgress).scanned} of ${(r.data as ScanProgress).expected})`;
      setLog((l) => [{ code, ok: true, text }, ...l].slice(0, 6));
      onScanned(r.data);
      if (typeof navigator.vibrate === "function") navigator.vibrate(80);
    } else {
      setLog((l) => [{ code, ok: false, text: r.message }, ...l].slice(0, 6));
    }
  };

  useEffect(() => {
    if (!cameraOn) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
          .BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            for (const found of await detector.detect(videoRef.current)) void send(found.rawValue);
          } catch {
            /* frame not ready */
          }
          timer = setTimeout(tick, 350);
        };
        void tick();
      } catch {
        setCameraOn(false);
        setLog((l) => [
          { code: "camera", ok: false, text: "Camera not available — type the code instead" },
          ...l,
        ]);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, stopId]);

  const onManual = (e: FormEvent) => {
    e.preventDefault();
    if (manual.trim()) void send(manual);
    setManual("");
  };

  return (
    <div className="space-y-3">
      {supported && (
        <button
          type="button"
          onClick={() => setCameraOn((v) => !v)}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm font-semibold text-zinc-100"
        >
          {cameraOn ? (
            <CameraOff className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Camera className="w-5 h-5" aria-hidden="true" />
          )}
          {cameraOn ? "Stop camera" : "Scan QR with camera"}
        </button>
      )}
      {cameraOn && (
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full rounded-xl border border-white/[0.1] bg-black aspect-video object-cover"
        />
      )}
      <form onSubmit={onManual} className="flex gap-2">
        <label htmlFor={`code-${stopId}`} className="sr-only">
          Container code
        </label>
        <input
          id={`code-${stopId}`}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="WR-2610-00042-C01"
          autoCapitalize="characters"
          autoComplete="off"
          className="flex-1 min-w-0 min-h-[48px] bg-[#161622] text-base text-zinc-100 border border-white/[0.1] rounded-xl px-3 font-mono"
        />
        <button
          type="submit"
          className="min-h-[48px] px-4 rounded-xl bg-amber-500 text-black font-semibold flex items-center gap-1"
        >
          <ScanLine className="w-5 h-5" aria-hidden="true" />
          Scan
        </button>
      </form>
      {log.length > 0 && (
        <ul aria-live="polite" className="space-y-1">
          {log.map((l, i) => (
            <li
              key={`${l.code}-${i}`}
              className={`text-sm font-mono break-all ${l.ok ? "text-emerald-400" : "text-rose-400"}`}
            >
              {l.ok ? "✓" : "✗"} {l.code}: {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
