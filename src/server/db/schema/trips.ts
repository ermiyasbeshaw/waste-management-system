import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { filled, id, timestamps, tsz } from "./_common";
import { collectionMethod, stopStatus, tripStatus } from "./enums";
import { facilities } from "./facilities";
import { drivers, vehicles } from "./fleet";
import { users } from "./users";
import { wasteRecords } from "./waste";

/**
 * Trips (architecture §6.2, CLAUDE.md §5). Code e.g. TR-261004-01. One IN_PROGRESS trip per vehicle and per
 * driver (partial unique indexes). CANCELLED needs a reason.
 */
export const trips = pgTable(
  "trips",
  {
    id: id(),
    tripCode: text("trip_code").notNull(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "restrict" }),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    status: tripStatus("status").notNull().default("PLANNED"),
    startedAt: tsz("started_at"),
    completedAt: tsz("completed_at"),
    cancelReason: text("cancel_reason"),
    cancelledAt: tsz("cancelled_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trips_trip_code_unique").on(t.tripCode),
    index("trips_planned_date_status_idx").on(t.plannedDate, t.status),
    uniqueIndex("trips_one_active_per_vehicle")
      .on(t.vehicleId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    uniqueIndex("trips_one_active_per_driver")
      .on(t.driverId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    check("trips_code_format", sql`${t.tripCode} ~ '^TR-[0-9]{6}-[0-9]{2}$'`),
    check(
      "trips_cancel_reason",
      sql`(${t.status} = 'CANCELLED') = (${filled(t.cancelReason)} AND ${t.cancelledAt} IS NOT NULL)`
    ),
    check(
      "trips_started_at",
      sql`${t.status} NOT IN ('IN_PROGRESS', 'COMPLETED') OR ${t.startedAt} IS NOT NULL`
    ),
    check("trips_completed_at", sql`(${t.status} = 'COMPLETED') = (${t.completedAt} IS NOT NULL)`),
  ]
);

/**
 * Ordered stops of a trip. `collection_method` and completion fields are set only when the stop is collected;
 * an override needs a reason; a skip needs a reason (CLAUDE.md §5–§6). Geofence is evidence only.
 */
export const tripStops = pgTable(
  "trip_stops",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    priorityOrder: integer("priority_order").notNull(),
    status: stopStatus("status").notNull().default("PENDING"),
    collectionMethod: collectionMethod("collection_method"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "restrict" }),
    arrivedAt: tsz("arrived_at"),
    completedAt: tsz("completed_at"),
    arrivalDistanceM: integer("arrival_distance_m"),
    /** null = no recent GPS point at arrival ("no GPS", DECISION v1.2 addendum). */
    geofenceOk: boolean("geofence_ok"),
    overrideReason: text("override_reason"),
    skipReason: text("skip_reason"),
    ...timestamps,
  },
  (t) => [
    unique("trip_stops_trip_order_unique").on(t.tripId, t.priorityOrder),
    unique("trip_stops_trip_facility_unique").on(t.tripId, t.facilityId),
    index("trip_stops_trip_order_idx").on(t.tripId, t.priorityOrder),
    check("trip_stops_priority_min", sql`${t.priorityOrder} >= 1`),
    check(
      "trip_stops_distance_min",
      sql`${t.arrivalDistanceM} IS NULL OR ${t.arrivalDistanceM} >= 0`
    ),
    // Completion fields exist only for collected stops.
    check(
      "trip_stops_collection_fields",
      sql`(${t.status} IN ('COLLECTED', 'COLLECTED_OVERRIDE')) =
          (${t.collectionMethod} IS NOT NULL AND ${t.completedAt} IS NOT NULL AND ${t.confirmedBy} IS NOT NULL)`
    ),
    // OVERRIDE ⇔ COLLECTED_OVERRIDE, with a written reason; OTP / IN_APP ⇔ COLLECTED.
    check(
      "trip_stops_override",
      sql`(${t.status} = 'COLLECTED_OVERRIDE') =
          (${t.collectionMethod} IS NOT NULL AND ${t.collectionMethod} = 'OVERRIDE' AND ${filled(t.overrideReason)})`
    ),
    check(
      "trip_stops_collected_method",
      sql`${t.status} <> 'COLLECTED' OR ${t.collectionMethod} IN ('OTP', 'IN_APP')`
    ),
    check("trip_stops_skip_reason", sql`(${t.status} = 'SKIPPED') = ${filled(t.skipReason)}`),
    check(
      "trip_stops_arrived_at",
      sql`${t.status} NOT IN ('ARRIVED', 'COLLECTED', 'COLLECTED_OVERRIDE') OR ${t.arrivedAt} IS NOT NULL`
    ),
  ]
);

/**
 * Waste linked to a stop. `active = false` once the stop is skipped / the trip cancelled (unlinked, history
 * kept). A waste record can be on only ONE active stop (partial unique index).
 */
export const tripStopWaste = pgTable(
  "trip_stop_waste",
  {
    id: id(),
    tripStopId: uuid("trip_stop_id")
      .notNull()
      .references(() => tripStops.id, { onDelete: "restrict" }),
    wasteRecordId: uuid("waste_record_id")
      .notNull()
      .references(() => wasteRecords.id, { onDelete: "restrict" }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("trip_stop_waste_stop_waste_unique").on(t.tripStopId, t.wasteRecordId),
    uniqueIndex("trip_stop_waste_one_active_stop")
      .on(t.wasteRecordId)
      .where(sql`${t.active}`),
  ]
);
