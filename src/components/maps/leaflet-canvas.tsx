"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { latLngBounds } from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { StopStatus } from "@/lib/statuses";
import { STATUS_META } from "@/lib/statuses";
import { STOP_COLOUR } from "./stop-colours";

/**
 * The Leaflet map itself (CLAUDE.md §2: OpenStreetMap tiles, URL and attribution from env). Client-only: always
 * loaded through `next/dynamic` with `ssr: false` (see live-map.tsx / route-replay.tsx), only on map pages.
 * Markers are vector circles (no image assets); every marker has a text label, never colour alone.
 */

export type LatLng = { lat: number; lng: number };

export interface CanvasVehicle extends LatLng {
  id: string;
  label: string;
  detail: string;
}

export interface CanvasStop extends LatLng {
  id: string;
  order: number;
  name: string;
  status: StopStatus;
  detail?: string;
}

/** Dire Dawa city centre — used when there is nothing to show. */
const DEFAULT_CENTER: [number, number] = [9.6009, 41.8501];
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Fits the view to the given points once, when the set of points changes identity (`fitKey`). */
function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(latLngBounds(points.map((p) => [p.lat, p.lng])), {
      padding: [32, 32],
      maxZoom: 15,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the point set changes
  }, [fitKey, map]);
  return null;
}

export default function LeafletCanvas({
  vehicles = [],
  stops = [],
  track = [],
  cursor,
  height,
  fitKey,
}: {
  vehicles?: CanvasVehicle[];
  stops?: CanvasStop[];
  track?: LatLng[];
  cursor?: (LatLng & { label: string }) | null;
  height: string;
  /** Changes when the map should re-fit (e.g. another trip selected). */
  fitKey: string;
}) {
  const all: LatLng[] = [...vehicles, ...stops, ...track];
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      style={{ height, width: "100%", background: "#0d0d12" }}
      className="rounded-2xl"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <FitBounds points={all} fitKey={fitKey} />
      {track.length > 1 && (
        <Polyline
          positions={track.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: "#10b981", weight: 4, opacity: 0.8 }}
        />
      )}
      {stops.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={9}
          pathOptions={{
            color: "#0a0a0f",
            weight: 2,
            fillColor: STOP_COLOUR[s.status],
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="font-semibold">
              {s.order}. {s.name}
            </span>
            <br />
            {STATUS_META[s.status]?.label ?? s.status}
            {s.detail ? (
              <>
                <br />
                {s.detail}
              </>
            ) : null}
          </Tooltip>
        </CircleMarker>
      ))}
      {vehicles.map((v) => (
        <CircleMarker
          key={v.id}
          center={[v.lat, v.lng]}
          radius={11}
          pathOptions={{ color: "#ecfdf5", weight: 3, fillColor: "#059669", fillOpacity: 1 }}
        >
          <Tooltip direction="right" offset={[10, 0]} permanent>
            <span className="font-mono font-semibold">{v.label}</span> · {v.detail}
          </Tooltip>
        </CircleMarker>
      ))}
      {cursor && (
        <CircleMarker
          center={[cursor.lat, cursor.lng]}
          radius={10}
          pathOptions={{ color: "#ecfdf5", weight: 3, fillColor: "#059669", fillOpacity: 1 }}
        >
          <Tooltip direction="right" offset={[10, 0]} permanent>
            <span className="font-mono">{cursor.label}</span>
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
