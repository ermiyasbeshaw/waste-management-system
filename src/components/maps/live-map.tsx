"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { formatTime } from "@/lib/dates";
import { STATUS_META, type StopStatus } from "@/lib/statuses";
import type { MapData } from "@/types/view-models";
import { STOP_COLOUR } from "./stop-colours";

/**
 * Live fleet map (Gate 4.4): positions of vehicles on trips IN_PROGRESS (CLAUDE.md §6), refreshed every 30 s from
 * GET /api/tracking/live. Vehicles without a GPS point are listed as "no GPS" instead of being drawn.
 */

const LeafletCanvas = dynamic(() => import("./leaflet-canvas"), {
  ssr: false,
  loading: () => <MapLoading />,
});

const POLL_MS = 30_000;

export function MapLoading({ height = "100%" }: { height?: string }) {
  return (
    <div
      style={{ height }}
      className="w-full bg-[#0d0d12] border border-white/[0.08] rounded-2xl flex items-center justify-center text-zinc-500 text-xs"
    >
      <span className="flex items-center gap-2">
        <Navigation className="w-4 h-4 animate-spin text-emerald-400" /> Loading map…
      </span>
    </div>
  );
}

export function StopLegend() {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400"
      aria-label="Stop colours"
    >
      {(Object.keys(STOP_COLOUR) as StopStatus[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STOP_COLOUR[s] }} />
          {STATUS_META[s].label}
        </li>
      ))}
    </ul>
  );
}

export function LiveMap({ initial, height }: { initial: MapData; height: string }) {
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/tracking/live", { cache: "no-store" });
        if (res.ok && !stopped) {
          setData((await res.json()) as MapData);
          setUpdatedAt(new Date());
        }
      } catch {
        // keep showing the last data; the next poll retries
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const located = data.vehicles.filter((v) => v.lat !== null && v.lng !== null);
  const noGps = data.vehicles.filter((v) => v.lat === null || v.lng === null);
  const stops = data.stops.filter((s) => s.lat !== null && s.lng !== null);

  return (
    <div className="space-y-3">
      <div className="relative" style={{ height }}>
        <LeafletCanvas
          height={height}
          fitKey={[...data.vehicles.map((v) => v.id), ...data.stops.map((s) => s.id)].join(",")}
          vehicles={located.map((v) => ({
            id: v.id,
            lat: v.lat!,
            lng: v.lng!,
            label: v.plateNumber,
            detail: `${v.speedKmh ?? 0} km/h · ${v.lastSeenAt ? formatTime(v.lastSeenAt) : ""}`,
          }))}
          stops={stops.map((s) => ({
            id: s.id,
            lat: s.lat!,
            lng: s.lng!,
            order: s.order,
            name: s.facilityName,
            status: s.status,
            detail: s.tripCode,
          }))}
        />
        <div className="absolute top-3 right-3 z-[1000] bg-[#121218]/90 border border-white/[0.1] rounded-xl px-3 py-1.5 text-[11px] font-mono text-zinc-200 pointer-events-none">
          {data.vehicles.length} on trip · updated {formatTime(updatedAt)}
        </div>
      </div>
      <StopLegend />
      {data.vehicles.length === 0 && (
        <p className="text-xs text-zinc-500">
          No trip is in progress. Positions are shown only during a trip.
        </p>
      )}
      {noGps.length > 0 && (
        <ul className="text-xs text-amber-300 space-y-0.5">
          {noGps.map((v) => (
            <li key={v.id}>
              {v.plateNumber} ({v.tripCode}): no GPS point yet
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
