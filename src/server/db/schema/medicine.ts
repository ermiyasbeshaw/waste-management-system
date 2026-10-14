import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
import { medicineRequestStatus } from "./enums";
import { facilities } from "./facilities";
import { users } from "./users";
import { wasteRecords } from "./waste";

/**
 * Medicine stock and expiry (CLAUDE.md §12, modules 21–22, Gate 8). Stock lines belong to one health facility;
 * they are never deleted (archived with `active = false`; every change audited). A line is identified inside its
 * facility by item + strength + form + batch (case-insensitive) — re-uploading the same batch replaces its quantity.
 */
export const medicineStock = pgTable(
  "medicine_stock",
  {
    id: id(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    item: text("item").notNull(),
    strength: text("strength").notNull().default(""),
    form: text("form").notNull().default(""),
    batch: text("batch").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("medicine_stock_line_unique").on(
      t.facilityId,
      sql`lower(${t.item})`,
      sql`lower(${t.strength})`,
      sql`lower(${t.form})`,
      sql`lower(${t.batch})`
    ),
    index("medicine_stock_facility_expiry_idx").on(t.facilityId, t.expiryDate),
    check("medicine_stock_quantity_min", sql`${t.quantity} >= 0`),
    check("medicine_stock_item_filled", filled(t.item)),
    check("medicine_stock_batch_filled", filled(t.batch)),
    check("medicine_stock_unit_filled", filled(t.unit)),
  ]
);

/**
 * Expiry alerts already raised (CLAUDE.md §12): one row per stock line and threshold (days before expiry; 0 = the
 * expiry day), so each threshold alerts only once.
 */
export const medicineStockAlerts = pgTable(
  "medicine_stock_alerts",
  {
    id: id(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => medicineStock.id, { onDelete: "restrict" }),
    thresholdDays: integer("threshold_days").notNull(),
    alertDate: date("alert_date", { mode: "string" }).notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("medicine_stock_alerts_once").on(t.stockId, t.thresholdDays),
    check("medicine_stock_alerts_threshold_min", sql`${t.thresholdDays} >= 0`),
  ]
);

/**
 * Medicine disposal requests (CLAUDE.md §12): PENDING_APPROVAL → APPROVED | REJECTED, decided only by the EFDA
 * officer (Workflow Engine). APPROVED links the PHARMACEUTICAL waste record created in the same transaction.
 * Code e.g. MD-2026-00007.
 */
export const medicineDisposalRequests = pgTable(
  "medicine_disposal_requests",
  {
    id: id(),
    requestCode: text("request_code").notNull(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    status: medicineRequestStatus("status").notNull().default("PENDING_APPROVAL"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    containerCount: integer("container_count").notNull(),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }).notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
    decidedAt: tsz("decided_at"),
    decisionReason: text("decision_reason"),
    wasteRecordId: uuid("waste_record_id").references(() => wasteRecords.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("medicine_disposal_requests_code_unique").on(t.requestCode),
    index("medicine_disposal_requests_facility_status_idx").on(t.facilityId, t.status),
    check(
      "medicine_disposal_requests_code_format",
      sql`${t.requestCode} ~ '^MD-[0-9]{4}-[0-9]{5}$'`
    ),
    check("medicine_disposal_requests_containers_min", sql`${t.containerCount} >= 1`),
    check("medicine_disposal_requests_weight_positive", sql`${t.weightKg} > 0`),
    check(
      "medicine_disposal_requests_decision_fields",
      sql`(${t.status} = 'PENDING_APPROVAL') = (${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL)`
    ),
    check(
      "medicine_disposal_requests_rejection_reason",
      sql`${t.status} <> 'REJECTED' OR ${filled(t.decisionReason)}`
    ),
    check(
      "medicine_disposal_requests_approved_waste",
      sql`(${t.status} = 'APPROVED') = (${t.wasteRecordId} IS NOT NULL)`
    ),
  ]
);

/** Lines of a request, with a snapshot of the stock line as it was when requested. */
export const medicineDisposalRequestLines = pgTable(
  "medicine_disposal_request_lines",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => medicineDisposalRequests.id, { onDelete: "restrict" }),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => medicineStock.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    item: text("item").notNull(),
    strength: text("strength").notNull(),
    form: text("form").notNull(),
    batch: text("batch").notNull(),
    unit: text("unit").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("medicine_disposal_request_lines_once").on(t.requestId, t.stockId),
    check("medicine_disposal_request_lines_quantity_min", sql`${t.quantity} >= 1`),
  ]
);
