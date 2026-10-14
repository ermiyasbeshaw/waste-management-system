/**
 * GPS tracker simulator for demos (CLAUDE.md §6, Gate 4.2). Development only — it plays a tracker: it posts
 * points to the real ingest endpoint with a real device token, so the whole path (auth, skew, duplicates, trip
 * link, maps) is exercised. It never writes to the database; it only reads the route.
 *
 * Run:   npm run gps:simulate -- --device TRK-A48291 [--url http://localhost:3000] [--interval 5] [--speed 35]
 *                                [--history]
 * Token: set SIM_TRACKER_TOKEN in your shell (Admin → Fleet → Manage → GPS trackers → "New token" shows it once).
 *        It is never printed.
 *
 * Route: the device's vehicle → its trip IN_PROGRESS → the stops in order → the disposal site. The truck drives in
 * straight lines between them at --speed km/h, one point every --interval seconds (live mode). With --history it
 * first back-fills the track from the trip start until now (fast, in batches of 100), then continues live.
 */
import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

if (process.env.NODE_ENV === "production")
  throw new Error("Refusing to run: NODE_ENV is production.");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v && !v.startsWith("--")) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

const deviceId = arg("device");
const baseUrl = arg("url", "http://localhost:3000").replace(/\/$/, "");
const intervalS = Number(arg("interval", "5"));
const speedKmh = Number(arg("speed", "35"));
const history = process.argv.includes("--history");
const token = process.env.SIM_TRACKER_TOKEN ?? "";
if (!token)
  throw new Error("Set SIM_TRACKER_TOKEN (the device token shown once in Admin → Fleet).");

type LatLng = { lat: number; lng: number };

async function loadRoute(): Promise<{ tripCode: string; startedAt: Date; waypoints: LatLng[] }> {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set (.env.local)");
  const pool = new Pool({ connectionString: url });
  try {
    const { rows: trips } = await pool.query(
      `SELECT t.id, t.trip_code, t.started_at FROM tracker_devices d
       JOIN trips t ON t.vehicle_id = d.vehicle_id AND t.status = 'IN_PROGRESS'
       WHERE d.device_id = $1 LIMIT 1`,
      [deviceId]
    );
    if (!trips[0]) throw new Error(`No trip in progress for the vehicle of tracker ${deviceId}.`);
    const { rows: stops } = await pool.query(
      `SELECT f.lat, f.lng FROM trip_stops s JOIN facilities f ON f.id = s.facility_id
       WHERE s.trip_id = $1 ORDER BY s.priority_order`,
      [trips[0].id]
    );
    const { rows: site } = await pool.query(
      `SELECT lat, lng FROM facilities WHERE type = 'DISPOSAL_SITE' AND status = 'ACTIVE' LIMIT 1`
    );
    const waypoints = [...stops, ...site]
      .filter((p) => p.lat !== null && p.lng !== null)
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    // Start a little away from the first stop, as if leaving the depot.
    if (waypoints[0])
      waypoints.unshift({ lat: waypoints[0].lat - 0.02, lng: waypoints[0].lng - 0.02 });
    if (waypoints.length < 2)
      throw new Error("The trip has no facility coordinates to drive between.");
    return {
      tripCode: trips[0].trip_code,
      startedAt: new Date(trips[0].started_at),
      waypoints,
    };
  } finally {
    await pool.end();
  }
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function metres(a: LatLng, b: LatLng): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Position after `distance` metres along the polyline (stays at the end when finished). */
function along(waypoints: LatLng[], distance: number): LatLng & { heading: number; done: boolean } {
  let left = distance;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const leg = metres(a, b);
    if (left <= leg) {
      const f = leg === 0 ? 0 : left / leg;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
        heading: bearing(a, b),
        done: false,
      };
    }
    left -= leg;
  }
  const end = waypoints[waypoints.length - 1];
  return { ...end, heading: 0, done: true };
}

async function post(
  points: { lat: number; lng: number; speedKmh: number; heading: number; recordedAt: string }[]
) {
  const res = await fetch(`${baseUrl}/api/tracking/v1/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": deviceId,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ points }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Ingest refused (${res.status}): ${body}`);
  return JSON.parse(body) as { accepted: number; duplicates: number };
}

const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

async function main() {
  const route = await loadRoute();
  const mps = (speedKmh * 1000) / 3600;
  console.log(
    `Simulating ${deviceId} on ${route.tripCode}: ${route.waypoints.length} waypoints, ${speedKmh} km/h, every ${intervalS} s`
  );
  let t = history ? route.startedAt.getTime() : Date.now();

  const pointAt = (time: number) => {
    const p = along(route.waypoints, ((time - route.startedAt.getTime()) / 1000) * mps);
    return {
      point: {
        lat: round(p.lat),
        lng: round(p.lng),
        speedKmh: p.done ? 0 : speedKmh,
        heading: round(p.heading, 1),
        recordedAt: new Date(time).toISOString(),
      },
      done: p.done,
    };
  };

  if (history) {
    let batch: ReturnType<typeof pointAt>["point"][] = [];
    for (; t <= Date.now(); t += intervalS * 1000) {
      batch.push(pointAt(t).point);
      if (batch.length === 100) {
        await post(batch);
        batch = [];
      }
    }
    if (batch.length) await post(batch);
    console.log("History back-filled up to now.");
  }

  for (;;) {
    const now = Date.now();
    const { point, done } = pointAt(now);
    const r = await post([point]);
    console.log(`${point.recordedAt}  ${point.lat}, ${point.lng}  accepted=${r.accepted}`);
    if (done) {
      console.log("Arrived at the disposal site. Stopping.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalS * 1000));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
