import { sql } from "drizzle-orm";
import { check, doublePrecision, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { facilityStatus, facilityType } from "./enums";

/**
 * Facilities (architecture §6.2). Address parts city/sub_city/woreda/kebele are optional (DECISION v1.2
 * addendum). Readiness ("has an OTP recipient") is derived from `users`, not stored here.
 */
export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Human code, unique and never reused, e.g. DD-REF-001. */
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: facilityType("type").notNull(),
    status: facilityStatus("status").notNull().default("ACTIVE"),
    region: text("region").notNull(),
    city: text("city"),
    subCity: text("sub_city"),
    woreda: text("woreda"),
    kebele: text("kebele"),
    address: text("address").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("facilities_code_format", sql`${t.code} ~ '^[A-Z]{2}-[A-Z]{3}-[0-9]{3}$'`),
    check("facilities_lat_range", sql`${t.lat} BETWEEN -90 AND 90`),
    check("facilities_lng_range", sql`${t.lng} BETWEEN -180 AND 180`),
    index("facilities_type_status_idx").on(t.type, t.status),
  ]
);

export type Facility = typeof facilities.$inferSelect;
export type NewFacility = typeof facilities.$inferInsert;
