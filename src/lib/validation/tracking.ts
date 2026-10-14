import { z } from "zod";

/**
 * GPS tracker ingest (CLAUDE.md §6). The tracker vendor and its data format are an OPEN QUESTION (§11); until it is
 * chosen, devices (and the dev simulator) send this generic JSON. A vendor adapter will translate into it.
 * ASSUMPTION: up to 100 points per request; speed in km/h; heading in degrees (0 ≤ h < 360).
 */

export const MAX_POINTS_PER_REQUEST = 100;

export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{3,64}$/);

export const gpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(300).nullish(),
  heading: z.number().min(0).lt(360).nullish(),
  /** ISO 8601 with a time zone (e.g. 2026-10-10T08:15:00Z). */
  recordedAt: z.string().datetime({ offset: true }),
});
export type GpsPoint = z.infer<typeof gpsPointSchema>;

export const ingestSchema = z.object({
  points: z.array(gpsPointSchema).min(1).max(MAX_POINTS_PER_REQUEST),
});
export type IngestInput = z.infer<typeof ingestSchema>;
