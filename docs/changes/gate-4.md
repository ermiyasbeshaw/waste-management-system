# Change log — Gate 4 (tracking)

Started 10 Oct 2026. No git; this file replaces commit history for Gate 4. Secret values are never written here.
Owner instruction (10 Oct 2026): "continue with all sub don't stop until done" — tasks 4.1–4.5 are built in one go.

The tracker vendor is still an OPEN QUESTION (CLAUDE.md §11). Gate 4 therefore defines a generic JSON format
behind the `TrackingProvider` adapter; a vendor adapter can be added later without touching the service or the
database.

## 4.1 Ingest — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/lib/validation/tracking.ts` | created | point rules (lat/lng ranges, speed ≥ 0, heading 0–<360, ISO time with zone), 1–100 points per request |
| `src/server/integrations/tracking/provider.ts` | created | `TrackingProvider` + `genericJsonProvider`: `X-Device-Id`, `Authorization: Bearer <device token>`, JSON body `{ points: [...] }` (ASSUMPTION until the vendor is chosen) |
| `src/server/rate-limit.ts` | created | fixed-window limiter in memory (one instance); a shared limiter is part of the 7.2 security review |
| `src/server/services/fleet.ts` | changed | `authenticateTracker` (unknown device, wrong token and inactive tracker give the same 401; SHA-256 compared in constant time) and `markTrackerSeen` (last report time only moves forward) — the fleet module keeps ownership of `tracker_devices` |
| `src/server/services/tracking.ts` | created | `ingestGpsPoints`: skew check from `tracker_max_clock_skew_minutes`, one INSERT … ON CONFLICT DO NOTHING (duplicates ignored), each point linked to the vehicle's trip whose time window contains it; tracker without vehicle → 409 `TRACKER_NOT_ASSIGNED` |
| `src/app/api/tracking/v1/ingest/route.ts` | created | public route (already listed in middleware), 120 requests/min per device + address (ASSUMPTION), returns counts only |
| `tests/unit/tracking-ingest.test.ts` | created | request parsing (401 / 400 / 422), point rules, rate limiter (10 tests) |
| `tests/integration/tracking.test.ts` | created | trip link by time window, replay = duplicates, `last_seen_at` never moves back, future points rejected, completed trip not linked after its end, 401 / 409 cases (5 tests) |

GPS points are not written to the audit log (one entry per point would flood it, and CLAUDE.md §6 does not list
them). The arrival evidence (distance, geofence flag) is stored on the stop and audited with the arrival.

## 4.2 Simulator — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `scripts/gps-simulator.ts` | created | plays a tracker against the real ingest: reads (only) the trip in progress of the device's vehicle, drives stop → stop → disposal site at `--speed`, one point every `--interval` s; `--history` back-fills from the trip start. Token from `SIM_TRACKER_TOKEN` (never printed) |
| `package.json` | changed | `npm run gps:simulate -- --device TRK-A48291` |

How to use: Admin → Fleet → Manage → GPS trackers → "New token" for the tracker (shown once) → in your shell set
`SIM_TRACKER_TOKEN` → start the trip as the driver → run the simulator.

## 4.3 Trip association, geofence, silent tracker

Trip association is part of the ingest (4.1). The geofence at arrival already uses the latest GPS point within
`tracker_silent_minutes` and stores `geofence_ok = null` ("no GPS") without one (built in 3.6); the silent-tracker
alert reads `tracker_devices.last_seen_at`, which the ingest now keeps up to date. No further change needed.

## 4.4 Real map — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `package.json`, `package-lock.json` | changed | added `react-leaflet` 4.2.1 (the React 18 line) and `@types/leaflet` 1.9.12 (dev); `leaflet` was already installed |
| `src/types/view-models/shared.ts` | changed | `MapVehicle` gets `tripCode`, `lat`, `lng`, `lastSeenAt`; `MapStop` gets `tripCode`, `lat`, `lng` |
| `src/server/queries/_shared.ts` | changed | `loadActiveTripMap`: latest GPS point per vehicle of a trip IN_PROGRESS (LATERAL join), stop coordinates |
| `src/server/queries/tracking.ts` | created | `getLiveMap`, `getReplayableTrips`, `getTripReplay` — super_admin and efda_officer only |
| `src/app/api/tracking/live/route.ts` | created | `GET /api/tracking/live` (polled every 30 s) |
| `src/components/maps/leaflet-canvas.tsx` | created | the Leaflet map (OSM tiles from `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION`), vector markers with text labels |
| `src/components/maps/stop-colours.ts` | created | marker colours, kept out of the Leaflet module so server code never imports Leaflet |
| `src/components/maps/live-map.tsx` | created | loads the canvas with `next/dynamic` `ssr: false`, polls, legend with status names, "no GPS" list |
| `src/components/admin/widgets.tsx`, `src/components/regulator/widgets.tsx` | changed | the prototype CSS radar is replaced by the live map |

## 4.5 Route replay — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/types/view-models/tracking.ts`, `index.ts` | created / changed | `TripReplay`, `ReplayableTrip` |
| `src/app/api/tracking/trips/[id]/route.ts` | created | `GET /api/tracking/trips/{id}` — track + stops with arrival evidence; 404 when not started |
| `src/components/maps/route-replay.tsx` | created | trip picker, play / pause, slider, stop table with distance and geofence result |
| `src/app/(desk)/regulator/map/page.tsx` | changed | replay below the live map (`?trip=<id>` preselects) |
| `src/app/(desk)/admin/trips/[id]/page.tsx` | changed | replay on the trip page once the trip has started |
| `tests/integration/tracking-queries.test.ts` | created | other roles 403; live position = latest point; replay order, stops, bad / unknown id → null (3 tests) |
| `tests/e2e/tracking.spec.ts` | created | HTTP ingest (401, duplicates, future, 422), replay API, hospital 403, real Leaflet map on /regulator/map and /admin/fleet |

ASSUMPTION: a replay shows at most 2 000 points; longer tracks are thinned evenly (first and last kept).

## Test fixes found while running Gate 4

| File | Action | Why |
|---|---|---|
| `tests/integration/pickup.test.ts` | changed | facility codes and user tags came from clock fragments (only ~1 000 different codes) and collided with codes left by earlier runs; now random letters + full timestamp |
| `tests/integration/admin-queries.test.ts` | changed | "today's trips" respects the query's LIMIT 50 when many test trips are in progress |

## Not deleted (needs approval)

`src/components/shared/facility-map.tsx` — the prototype CSS "radar" is no longer used anywhere. Listed for
deletion; kept until the owner approves.

How to undo: restore the listed files from the pre-Gate-4 backup folder, delete the created files, and run
`npm uninstall react-leaflet @types/leaflet`.
