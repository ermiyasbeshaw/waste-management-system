"use client";

import { Truck, Package } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useDriverData } from "@/components/driver/driver-shell";
import { StopCard } from "@/components/driver/stop-card";
import { StopActions } from "@/components/driver/stop-actions";
import { StartTripButton } from "@/components/driver/start-trip-button";
import { DriverQrScanner } from "@/components/driver/driver-qr-scanner";
import { DriverAssignedDisposals } from "@/components/driver/driver-assigned-disposals";
import { toEatDateString } from "@/lib/dates";

/** /driver — today's active trip and its stops (single column, mobile-first). */
export default function DriverTodayPage() {
  const { activeTrip, upcomingTrips } = useDriverData();

  if (!activeTrip) {
    const today = toEatDateString(new Date());
    const todays = upcomingTrips.find((t) => t.plannedDate === today);
    return (
      <div className="space-y-4">
        <DriverAssignedDisposals />
        <DriverQrScanner />
        <EmptyState title="No active trip" description="You have no trip in progress right now." />
        {todays && <StartTripButton tripId={todays.id} tripCode={todays.tripCode} />}
      </div>
    );
  }
  const anotherStopOpen = (stopId: string) =>
    activeTrip.stops.some((s) => s.status === "ARRIVED" && s.id !== stopId);

  const progress =
    activeTrip.stopsTotal > 0
      ? Math.round((activeTrip.stopsCompleted / activeTrip.stopsTotal) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <DriverAssignedDisposals />
      <DriverQrScanner />
      {/* Active Trip Banner */}
      <section className="bg-[#111116] border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-amber-400 font-semibold uppercase">
            Active collection route
          </span>
          <StatusBadge status={activeTrip.status} size="sm" />
        </div>
        <h2 className="text-xl font-bold text-white font-mono">{activeTrip.tripCode}</h2>

        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
          <div className="bg-[#161622] px-3 py-2 rounded-xl border border-white/[0.08] flex items-center gap-2 font-mono min-w-0">
            <Truck className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeTrip.vehiclePlate}</span>
          </div>
          <div className="bg-[#161622] px-3 py-2 rounded-xl border border-white/[0.08] flex items-center gap-2 font-mono min-w-0">
            <Package className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeTrip.weightKgTotal} kg</span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-white/[0.05]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">
              {activeTrip.stopsCompleted} of {activeTrip.stopsTotal} stops completed
            </span>
            <span className="font-mono text-amber-400 font-bold">{progress}%</span>
          </div>
          <div
            className="w-full bg-[#181822] rounded-full h-2 overflow-hidden border border-white/[0.04]"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Route progress"
          >
            <div
              className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      {/* Stop Sequence */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">Ordered stop sequence</h2>
        {activeTrip.stops.map((stop) => (
          <StopCard
            key={stop.id}
            stop={stop}
            actions={
              stop.status === "PENDING" || stop.status === "ARRIVED" ? (
                <StopActions stop={stop} anotherStopOpen={anotherStopOpen(stop.id)} />
              ) : undefined
            }
          />
        ))}
      </section>
    </div>
  );
}
