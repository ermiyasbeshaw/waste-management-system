"use client";

import { formatDate } from "@/lib/dates";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useDriverData } from "@/components/driver/driver-shell";

/** /driver/upcoming — the driver's planned trips. */
export default function DriverUpcomingPage() {
  const { upcomingTrips } = useDriverData();

  if (upcomingTrips.length === 0) {
    return (
      <EmptyState title="No upcoming trips" description="No planned trips are assigned to you." />
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-white">Upcoming routes</h2>
      {upcomingTrips.map((trip) => (
        <article
          key={trip.id}
          className="bg-[#111116] border border-white/[0.07] rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white font-mono">{trip.tripCode}</h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                Planned: {formatDate(trip.plannedDate)}
              </p>
            </div>
            <StatusBadge status={trip.status} size="sm" />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-white/[0.04]">
            <div>
              <dt className="text-zinc-500 text-xs">Vehicle</dt>
              <dd className="font-mono font-bold text-zinc-200 break-words">{trip.vehiclePlate}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 text-xs">Total stops</dt>
              <dd className="font-mono font-bold text-zinc-200">{trip.stopsTotal} Facilities</dd>
            </div>
            <div>
              <dt className="text-zinc-500 text-xs">Estimated bins</dt>
              <dd className="font-mono font-bold text-zinc-200">
                {trip.containersTotal} Containers
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 text-xs">Estimated weight</dt>
              <dd className="font-mono font-bold text-zinc-200">{trip.weightKgTotal} kg</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
