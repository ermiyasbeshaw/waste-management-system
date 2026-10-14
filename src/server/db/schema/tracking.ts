import { sql } from "drizzle-orm";
import { check, doublePrecision, index, pgTable, real, unique, uuid } from "drizzle-orm/pg-core";
import { id, tsz } from "./_common";
import { trackerDevices, vehicles } from "./fleet";
import { trips } from "./trips";

/**
 * GPS points from vehicle trackers (CLAUDE.md §6). Append-only (no updated_at). Duplicates are ignored via the
 * unique (device_id, recorded_at); `trip_id` is set when the point falls inside an active trip of the vehicle.
 */
export const gpsEvents = pgTable(
  "gps_events",
  {
    id: id(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => trackerDevices.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "restrict" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKmh: real("speed_kmh"),
    heading: real("heading"),
    recordedAt: tsz("recorded_at").notNull(),
    receivedAt: tsz("received_at").notNull().defaultNow(),
  },
  (t) => [
    unique("gps_events_device_recorded_unique").on(t.deviceId, t.recordedAt),
    index("gps_events_vehicle_recorded_idx").on(t.vehicleId, t.recordedAt.desc()),
    index("gps_events_trip_idx").on(t.tripId),
    check("gps_events_lat_range", sql`${t.lat} BETWEEN -90 AND 90`),
    check("gps_events_lng_range", sql`${t.lng} BETWEEN -180 AND 180`),
    check("gps_events_speed_min", sql`${t.speedKmh} IS NULL OR ${t.speedKmh} >= 0`),
    check(
      "gps_events_heading_range",
      sql`${t.heading} IS NULL OR (${t.heading} >= 0 AND ${t.heading} < 360)`
    ),
  ]
);
