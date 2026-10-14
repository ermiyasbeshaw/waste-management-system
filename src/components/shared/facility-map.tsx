"use client";

import React, { useEffect, useState } from "react";
import type { MapStop, MapVehicle } from "@/types/view-models";
import { MapPin, Truck, Navigation } from "lucide-react";
import type { StopStatus } from "@/lib/statuses";

interface FacilityMapProps {
  vehicles?: MapVehicle[];
  stops?: MapStop[];
  routeCoordinates?: [number, number][];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
}

export function FacilityMap({
  vehicles = [],
  stops = [],
  height = "380px",
  className = "",
}: FacilityMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedPin, setSelectedPin] = useState<MapVehicle | MapStop | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div
        style={{ height }}
        className={`w-full bg-[#0d0d12] border border-white/[0.08] rounded-2xl flex items-center justify-center text-zinc-500 text-xs ${className}`}
      >
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Initializing GPS GIS Radar...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full bg-[#0d0d12] border border-white/[0.08] rounded-2xl overflow-hidden ${className}`}
      style={{ height }}
    >
      {/* Interactive Map Visual Mock with Leaflet styling overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e1e28_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 z-10 bg-[#121218]/90 backdrop-blur-md border border-white/[0.1] rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-[11px] font-mono text-zinc-200">
          DIRE DAWA LIVE GIS RADAR ({vehicles.length} FLEET UNITS)
        </span>
      </div>

      {/* Compass / Tile Badge */}
      <div className="absolute top-3 right-3 z-10 bg-[#121218]/90 backdrop-blur-md border border-white/[0.1] rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-400 shadow-lg">
        EPSG:4326 WGS84
      </div>

      {/* Simulated Visual Pins Representation on Radar Grid */}
      <div className="relative w-full h-full flex items-center justify-center p-6">
        {/* Route Connection Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-emerald-500/30 stroke-2 stroke-dasharray-4">
          <line
            x1="25%"
            y1="35%"
            x2="50%"
            y2="50%"
            stroke="rgba(16,185,129,0.4)"
            strokeWidth="2"
            strokeDasharray="4"
          />
          <line
            x1="50%"
            y1="50%"
            x2="75%"
            y2="40%"
            stroke="rgba(16,185,129,0.4)"
            strokeWidth="2"
            strokeDasharray="4"
          />
          <line
            x1="75%"
            y1="40%"
            x2="65%"
            y2="75%"
            stroke="rgba(16,185,129,0.4)"
            strokeWidth="2"
            strokeDasharray="4"
          />
        </svg>

        {/* Fleet Vehicle Marker */}
        {vehicles.map((v, i) => (
          <div
            key={v.id}
            onClick={() => setSelectedPin(v)}
            style={{
              left: `${45 + i * 15}%`,
              top: `${40 + i * 10}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group z-20"
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute w-8 h-8 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-black flex items-center justify-center font-bold shadow-glow transition-transform group-hover:scale-110">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-1.5 px-2 py-0.5 rounded-md bg-[#121218] border border-emerald-500/40 text-[10px] font-mono text-emerald-300 whitespace-nowrap shadow-md text-center">
              {v.plateNumber} ({v.speedKmh === null ? "no GPS" : `${v.speedKmh} km/h`})
            </div>
          </div>
        ))}

        {/* Facility Stops Markers */}
        {stops.map((stop, idx) => {
          const statusColors: Record<StopStatus, string> = {
            COLLECTED: "bg-emerald-500 text-black border-emerald-400",
            COLLECTED_OVERRIDE: "bg-emerald-500 text-black border-amber-400",
            ARRIVED: "bg-blue-500 text-white border-blue-400 animate-pulse",
            PENDING: "bg-amber-500 text-black border-amber-400",
            SKIPPED: "bg-rose-500 text-white border-rose-400",
          };
          const pinColor = statusColors[stop.status] || statusColors.PENDING;

          const positions = [
            { left: "25%", top: "35%" },
            { left: "50%", top: "50%" },
            { left: "75%", top: "40%" },
            { left: "65%", top: "75%" },
          ];
          const pos = positions[idx % positions.length];

          return (
            <div
              key={stop.id}
              onClick={() => setSelectedPin(stop)}
              style={pos}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group z-10"
            >
              <div
                className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shadow-md transition-transform group-hover:scale-110 ${pinColor}`}
              >
                {stop.order}
              </div>
              <div className="mt-1 px-2 py-0.5 rounded-md bg-[#121218]/90 border border-white/[0.1] text-[10px] font-medium text-zinc-300 whitespace-nowrap shadow-md text-center">
                {stop.facilityName.split(" ")[0]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Item Detail Card Drawer */}
      {selectedPin && (
        <div className="absolute bottom-3 left-3 right-3 z-30 bg-[#14141d]/95 backdrop-blur-md border border-white/[0.12] rounded-xl p-3 text-xs flex items-center justify-between shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {"plateNumber" in selectedPin
                  ? selectedPin.plateNumber
                  : selectedPin.facilityName || "Stop Location"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {"plateNumber" in selectedPin
                ? `Driver: ${selectedPin.driverName || "Assigned"}`
                : selectedPin.address}
            </p>
          </div>
          <button
            onClick={() => setSelectedPin(null)}
            className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-zinc-300 text-[11px]"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
