import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { filled, id, timestamps, tsz } from "./_common";
import { driverStatus, licenseSubject, vehicleStatus } from "./enums";
import { users } from "./users";

/** Vehicles (architecture §6.2). ASSUMPTION (approved 8 Oct 2026): optional `model`. No battery (DECISION). */
export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    plateNo: text("plate_no").notNull(),
    model: text("model"),
    capacityKg: numeric("capacity_kg", { precision: 10, scale: 2 }).notNull(),
    status: vehicleStatus("status").notNull().default("ACTIVE"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vehicles_plate_no_unique").on(t.plateNo),
    check("vehicles_plate_no_filled", filled(t.plateNo)),
    check("vehicles_capacity_positive", sql`${t.capacityKg} > 0`),
  ]
);

/** Driver profile, one per user with role `driver` (trigger enforces the role). */
export const drivers = pgTable(
  "drivers",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    licenseNo: text("license_no").notNull(),
    defaultVehicleId: uuid("default_vehicle_id").references(() => vehicles.id, {
      onDelete: "restrict",
    }),
    status: driverStatus("status").notNull().default("OFF_DUTY"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("drivers_user_id_unique").on(t.userId),
    uniqueIndex("drivers_license_no_unique").on(t.licenseNo),
    check("drivers_license_no_filled", filled(t.licenseNo)),
  ]
);

/** GPS trackers. The device token is stored only as a hash (CLAUDE.md §6). One tracker per vehicle. */
export const trackerDevices = pgTable(
  "tracker_devices",
  {
    id: id(),
    deviceId: text("device_id").notNull(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    lastSeenAt: tsz("last_seen_at"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tracker_devices_device_id_unique").on(t.deviceId),
    uniqueIndex("tracker_devices_vehicle_id_unique").on(t.vehicleId),
    check("tracker_devices_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ]
);

/** Licenses and permits for vehicles, drivers, facilities and the site. Expired → assignment blocked (E5). */
export const licenses = pgTable(
  "licenses",
  {
    id: id(),
    subjectType: licenseSubject("subject_type").notNull(),
    /** Id of the vehicle / driver / facility the license belongs to (polymorphic, checked by the service). */
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind").notNull(),
    number: text("number").notNull(),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("licenses_subject_idx").on(t.subjectType, t.subjectId),
    index("licenses_expires_on_idx").on(t.expiresOn),
    check("licenses_kind_filled", filled(t.kind)),
    check("licenses_number_filled", filled(t.number)),
    check("licenses_dates_order", sql`${t.issuedOn} IS NULL OR ${t.expiresOn} >= ${t.issuedOn}`),
  ]
);
