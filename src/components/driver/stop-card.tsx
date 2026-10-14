import type React from "react";
import { MapPin, Clock, Package, ShieldAlert } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { clsx } from "clsx";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StopCard as StopCardData } from "@/types/view-models";

/** One stop of the driver's route, laid out in a single column for a 360 px screen. */
export function StopCard({ stop, actions }: { stop: StopCardData; actions?: React.ReactNode }) {
  const isDone = stop.status === "COLLECTED" || stop.status === "COLLECTED_OVERRIDE";
  const isCurrent = stop.status === "ARRIVED";
  const isSkipped = stop.status === "SKIPPED";

  return (
    <article
      aria-current={isCurrent ? "step" : undefined}
      className={clsx(
        "bg-[#111116] border rounded-2xl p-4 space-y-3",
        isCurrent
          ? "border-blue-500/50 shadow-glow ring-1 ring-blue-500/20 bg-[#12141c]"
          : isDone
            ? "border-emerald-500/20"
            : isSkipped
              ? "border-rose-500/20 bg-[#161214]"
              : "border-white/[0.07]"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
            isCurrent
              ? "bg-blue-500 text-white"
              : isDone
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : isSkipped
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-zinc-800 text-zinc-300"
          )}
        >
          #{stop.order}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white leading-snug break-words">
            {stop.facility.name}
          </h3>
          <p className="text-xs font-mono text-zinc-500">{stop.facility.code}</p>
          <p className="flex items-start gap-1.5 text-sm text-zinc-400 mt-1">
            <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="break-words">{stop.facility.address}</span>
          </p>
        </div>
      </div>

      <StatusBadge status={stop.status} size="md" />

      <dl className="grid grid-cols-1 gap-2 pt-3 border-t border-white/[0.04] text-sm">
        {stop.arrivedAt && (
          <div className="bg-[#161620] p-3 rounded-xl border border-white/[0.04] flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
            <div>
              <dt className="text-xs text-zinc-500">Arrived</dt>
              <dd className="font-semibold font-mono text-zinc-200">
                {formatTime(stop.arrivedAt)}
              </dd>
            </div>
          </div>
        )}

        <div className="bg-[#161620] p-3 rounded-xl border border-white/[0.04] flex items-center gap-3">
          <Package className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
          <div>
            <dt className="text-xs text-zinc-500">Containers</dt>
            <dd className="font-semibold text-zinc-200">
              {stop.expectedContainers} Bins ({stop.weightKg} kg)
            </dd>
            {isDone && stop.collectionMethod && (
              <dd className="text-sm text-emerald-400 font-medium">
                ✓ Handover confirmed (
                {stop.collectionMethod === "OTP"
                  ? "OTP"
                  : stop.collectionMethod === "IN_APP"
                    ? "in-app by the facility"
                    : "admin override"}
                )
              </dd>
            )}
          </div>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {stop.categories.map((cat, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161622] text-xs text-zinc-300 border border-white/[0.06]"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.colourHex }}
              aria-hidden="true"
            />
            <span>
              {cat.name}: {cat.count} units
            </span>
          </span>
        ))}
        {stop.collectionMethod === "OVERRIDE" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20 font-medium">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>Pickup completed by admin override</span>
          </span>
        )}
      </div>
      {actions && <div className="pt-3 border-t border-white/[0.06]">{actions}</div>}
    </article>
  );
}
