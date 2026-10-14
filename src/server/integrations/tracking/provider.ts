import "server-only";
import { deviceIdSchema, ingestSchema, type GpsPoint } from "@/lib/validation/tracking";
import { AppError } from "@/server/errors";

/**
 * Tracking adapters (CLAUDE.md §2 / §6). A provider turns a tracker's HTTP request into device credentials and
 * GPS points. The vendor is an OPEN QUESTION (§11): until it is chosen, `genericJsonProvider` is used by the dev
 * simulator and by any device that can send this format. A vendor adapter is added here; the ingest service and
 * the database never see vendor formats.
 */

export interface TrackerRequest {
  deviceId: string;
  /** Per-device secret, compared only as a SHA-256 hash; never logged. */
  token: string;
  points: GpsPoint[];
}

export interface TrackingProvider {
  readonly name: string;
  parse(req: Request): Promise<TrackerRequest>;
}

/**
 * ASSUMPTION (generic format): `X-Device-Id: <device id>`, `Authorization: Bearer <device token>`, and a JSON body
 * `{ "points": [{ "lat", "lng", "speedKmh"?, "heading"?, "recordedAt" (ISO 8601) }] }`.
 */
export const genericJsonProvider: TrackingProvider = {
  name: "generic-json",
  async parse(req) {
    const deviceId = deviceIdSchema.safeParse(req.headers.get("x-device-id") ?? "");
    const token = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(req.headers.get("authorization") ?? "");
    if (!deviceId.success || !token) {
      throw new AppError(
        "UNAUTHENTICATED",
        401,
        "A valid device ID and device token are required."
      );
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError("BAD_REQUEST", 400, "The body must be JSON.");
    }
    const parsed = ingestSchema.parse(body); // ZodError → 422 VALIDATION_ERROR
    return { deviceId: deviceId.data, token: token[1], points: parsed.points };
  },
};

export function getTrackingProvider(): TrackingProvider {
  return genericJsonProvider;
}
