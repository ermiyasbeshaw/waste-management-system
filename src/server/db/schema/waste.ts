import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { filled, id, timestamps, tsz } from "./_common";
import { containerStatus, wasteStatus } from "./enums";
import { facilities } from "./facilities";
import { wasteCategories } from "./catalog";
import { users } from "./users";

/**
 * Waste records (architecture §6.2, CLAUDE.md §5–§6). Waste ID e.g. WR-2610-00042.
 * Weight is recorded only (no discrepancy checks). The facility may not be the DISPOSAL_SITE (trigger).
 */
export const wasteRecords = pgTable(
  "waste_records",
  {
    id: id(),
    wasteCode: text("waste_code").notNull(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => wasteCategories.id, { onDelete: "restrict" }),
    containerCount: integer("container_count").notNull(),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }).notNull(),
    status: wasteStatus("status").notNull().default("REGISTERED"),
    registeredBy: uuid("registered_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cancelReason: text("cancel_reason"),
    cancelledAt: tsz("cancelled_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("waste_records_waste_code_unique").on(t.wasteCode),
    index("waste_records_facility_status_created_idx").on(t.facilityId, t.status, t.createdAt),
    check("waste_records_code_format", sql`${t.wasteCode} ~ '^WR-[0-9]{4}-[0-9]{5}$'`),
    check("waste_records_container_count_min", sql`${t.containerCount} >= 1`),
    check("waste_records_weight_positive", sql`${t.weightKg} > 0`),
    // CANCELLED ⇔ a reason and a time (CLAUDE.md §5).
    check(
      "waste_records_cancel_reason",
      sql`(${t.status} = 'CANCELLED') = (${filled(t.cancelReason)} AND ${t.cancelledAt} IS NOT NULL)`
    ),
  ]
);

/**
 * Containers: one QR label per container, code e.g. WR-2610-00042-C03 (trigger: prefix = waste code and
 * seq_no ≤ container_count). MISSING / REFUSED need a reason.
 */
export const containers = pgTable(
  "containers",
  {
    id: id(),
    containerCode: text("container_code").notNull(),
    wasteRecordId: uuid("waste_record_id")
      .notNull()
      .references(() => wasteRecords.id, { onDelete: "restrict" }),
    seqNo: integer("seq_no").notNull(),
    status: containerStatus("status").notNull().default("LABELLED"),
    exceptionReason: text("exception_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("containers_container_code_unique").on(t.containerCode),
    unique("containers_waste_record_seq_unique").on(t.wasteRecordId, t.seqNo),
    index("containers_status_idx").on(t.status),
    check("containers_code_format", sql`${t.containerCode} ~ '^WR-[0-9]{4}-[0-9]{5}-C[0-9]{2,3}$'`),
    check("containers_seq_no_min", sql`${t.seqNo} >= 1`),
    check(
      "containers_exception_reason",
      sql`(${t.status} IN ('MISSING', 'REFUSED')) = ${filled(t.exceptionReason)}`
    ),
  ]
);
