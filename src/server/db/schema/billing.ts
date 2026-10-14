import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { filled, id, timestamps, tsz } from "./_common";
import { contractStatus, invoiceStatus } from "./enums";
import { facilities } from "./facilities";

/**
 * Service contracts (architecture §6.2). DECISION v1.2 addendum: human code CT-YYYY-NNNN. Money in santim.
 * Contracts of the same facility may not overlap in time (exclusion constraint, custom migration).
 */
export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    contractCode: text("contract_code").notNull(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    monthlyFeeSantim: bigint("monthly_fee_santim", { mode: "number" }).notNull(),
    terms: text("terms"),
    status: contractStatus("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("contracts_contract_code_unique").on(t.contractCode),
    index("contracts_facility_status_idx").on(t.facilityId, t.status),
    check("contracts_code_format", sql`${t.contractCode} ~ '^CT-[0-9]{4}-[0-9]{4}$'`),
    check("contracts_dates_order", sql`${t.endDate} > ${t.startDate}`),
    check("contracts_fee_min", sql`${t.monthlyFeeSantim} >= 0`),
  ]
);

/**
 * Monthly invoices (CLAUDE.md §5–§6). One per contract and month. VAT rate copied at creation;
 * total = subtotal + VAT; due_date set when ISSUED (DECISION v1.2 addendum). Only super_admin changes invoices.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    invoiceNo: text("invoice_no").notNull(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "restrict" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    subtotalSantim: bigint("subtotal_santim", { mode: "number" }).notNull(),
    vatRatePercent: numeric("vat_rate_percent", { precision: 5, scale: 2 }).notNull(),
    vatSantim: bigint("vat_santim", { mode: "number" }).notNull(),
    totalSantim: bigint("total_santim", { mode: "number" }).notNull(),
    status: invoiceStatus("status").notNull().default("DRAFT"),
    issuedAt: tsz("issued_at"),
    dueDate: date("due_date", { mode: "string" }),
    settledAt: tsz("settled_at"),
    settlementRef: text("settlement_ref"),
    cancelledAt: tsz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_invoice_no_unique").on(t.invoiceNo),
    unique("invoices_contract_period_unique").on(t.contractId, t.periodStart),
    index("invoices_facility_status_idx").on(t.facilityId, t.status),
    check("invoices_no_format", sql`${t.invoiceNo} ~ '^INV-[0-9]{4}-[0-9]{2}-[0-9]{4}$'`),
    check("invoices_period_order", sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      "invoices_money_min",
      sql`${t.subtotalSantim} >= 0 AND ${t.vatSantim} >= 0 AND ${t.totalSantim} >= 0`
    ),
    check("invoices_total_sum", sql`${t.totalSantim} = ${t.subtotalSantim} + ${t.vatSantim}`),
    check("invoices_vat_rate_range", sql`${t.vatRatePercent} BETWEEN 0 AND 100`),
    check(
      "invoices_issued_fields",
      sql`${t.status} NOT IN ('ISSUED', 'SETTLED_OFFLINE')
          OR (${t.issuedAt} IS NOT NULL AND ${t.dueDate} IS NOT NULL)`
    ),
    check(
      "invoices_settled_fields",
      sql`(${t.status} = 'SETTLED_OFFLINE') = (${t.settledAt} IS NOT NULL AND ${filled(t.settlementRef)})`
    ),
    check(
      "invoices_cancel_reason",
      sql`(${t.status} = 'CANCELLED') = (${t.cancelledAt} IS NOT NULL AND ${filled(t.cancelReason)})`
    ),
  ]
);
