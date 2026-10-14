"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDateTime, formatTime } from "@/lib/dates";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ReplayableTrip, TripReplay } from "@/types/view-models";
import { MapLoading, StopLegend } from "./live-map";

/**
 * Route replay (Gate 4.5, CLAUDE.md §3: super_admin and the EFDA officer, read-only). Loads the stored track from
 * GET /api/tracking/trips/{id} and plays it back with a slider; stops show their arrival evidence (distance and
 * geofence flag, or "no GPS").
 */

const LeafletCanvas = dynamic(() => import("./leaflet-canvas"), {
  ssr: false,
  loading: () => <MapLoading />,
});

function geofenceText(s: TripReplay["stops"][number]): string {
  if (!s.arrivedAt) return "not arrived";
  if (s.geofenceOk === null) return "no GPS at arrival";
  return `${s.arrivalDistanceM ?? "?"} m from the facility · ${s.geofenceOk ? "inside" : "OUTSIDE"} the geofence`;
}

export function RouteReplay({
  trips,
  initialTripId,
  height = "420px",
}: {
  /** Trips to choose from; omit to replay only `initialTripId`. */
  trips?: ReplayableTrip[];
  initialTripId: string | null;
  height?: string;
}) {
  const [tripId, setTripId] = useState(initialTripId);
  const [replay, setReplay] = useState<TripReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    setReplay(null);
    setError(null);
    setPlaying(false);
    fetch(`/api/tracking/trips/${tripId}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(body?.error?.message ?? "Could not load the route.");
        else {
          setReplay(body as TripReplay);
          setIndex(Math.max(0, (body as TripReplay).points.length - 1));
        }
      })
      .catch(() => !cancelled && setError("Could not load the route. Check the connection."));
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (!playing || !replay) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i >= replay.points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + Math.max(1, Math.round(replay.points.length / 300));
      });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, replay]);

  const points = useMemo(() => replay?.points ?? [], [replay]);
  const at = points[Math.min(index, points.length - 1)];
  const stops = (replay?.stops ?? []).filter((s) => s.lat !== null && s.lng !== null);

  return (
    <div className="space-y-3">
      {trips && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Trip
          <select
            className="bg-[#0d0d12] border border-white/[0.1] rounded-lg px-2 py-1.5 text-zinc-200"
            value={tripId ?? ""}
            onChange={(e) => setTripId(e.target.value || null)}
          >
            <option value="">Choose a trip…</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tripCode} · {t.vehiclePlate} · {t.plannedDate} · {t.points} GPS points
              </option>
            ))}
          </select>
        </label>
      )}

      {!tripId && <p className="text-xs text-zinc-500">Choose a trip to replay its route.</p>}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      {tripId && !replay && !error && <MapLoading height={height} />}

      {replay && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <span className="font-mono text-zinc-200">{replay.tripCode}</span>
            <StatusBadge status={replay.status} />
            <span>
              {replay.vehiclePlate} · {replay.driverName}
            </span>
            <span>
              {replay.startedAt ? formatDateTime(replay.startedAt) : ""}
              {replay.endedAt ? ` → ${formatDateTime(replay.endedAt)}` : " → in progress"}
            </span>
          </div>
          <div style={{ height }}>
            <LeafletCanvas
              height={height}
              fitKey={replay.id}
              track={points.slice(0, index + 1)}
              cursor={
                at
                  ? {
                      lat: at.lat,
                      lng: at.lng,
                      label: `${formatTime(at.recordedAt)} · ${at.speedKmh ?? 0} km/h`,
                    }
                  : null
              }
              stops={stops.map((s) => ({
                id: `${replay.id}-${s.order}`,
                lat: s.lat!,
                lng: s.lng!,
                order: s.order,
                name: s.facilityName,
                status: s.status,
                detail: geofenceText(s),
              }))}
            />
          </div>
          {points.length === 0 ? (
            <p className="text-xs text-amber-300">No GPS points were stored for this trip.</p>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (index >= points.length - 1) setIndex(0);
                  setPlaying((p) => !p);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-semibold"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                aria-label="Replay position"
                min={0}
                max={points.length - 1}
                value={Math.min(index, points.length - 1)}
                onChange={(e) => {
                  setPlaying(false);
                  setIndex(Number(e.target.value));
                }}
                className="flex-1 accent-emerald-500"
              />
              <span className="text-[11px] font-mono text-zinc-400 w-40 text-right">
                {at ? formatDateTime(at.recordedAt) : ""}
              </span>
            </div>
          )}
          {replay.thinned && (
            <p className="text-[11px] text-zinc-500">
              Long track: points are thinned evenly for display.
            </p>
          )}
          <StopLegend />
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left">
              <tr>
                <th className="py-1 font-medium">Stop</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Arrival evidence</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {replay.stops.map((s) => (
                <tr key={s.order} className="border-t border-white/[0.05]">
                  <td className="py-1.5">
                    {s.order}. {s.facilityName}
                  </td>
                  <td className="py-1.5">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className={`py-1.5 ${s.geofenceOk === false ? "text-amber-300" : ""}`}>
                    {geofenceText(s)}
                    {s.arrivedAt ? ` · ${formatTime(s.arrivedAt)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
