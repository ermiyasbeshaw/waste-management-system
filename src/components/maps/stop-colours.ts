import type { StopStatus } from "@/lib/statuses";

/** Stop marker colours (kept out of leaflet-canvas.tsx so server-rendered code never imports Leaflet). */
export const STOP_COLOUR: Record<StopStatus, string> = {
  PENDING: "#f59e0b",
  ARRIVED: "#3b82f6",
  COLLECTED: "#10b981",
  COLLECTED_OVERRIDE: "#a3e635",
  SKIPPED: "#f43f5e",
};
