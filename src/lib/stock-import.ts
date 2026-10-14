import { z } from "zod";

/**
 * Medicine stock import (CLAUDE.md §12, Gate 8.2): turns a CSV text or a spreadsheet table into checked rows with
 * per-row errors, so the user sees a preview before anything is saved. Pure functions (unit-tested); the server
 * validates again when saving.
 *
 * Owner decision (11 Oct 2026): ONLY the columns item, strength, form, batch, quantity, unit, expiry date (any order,
 * any case; "expiry_date" counts as "expiry date"). Other names are not recognised until the owner says otherwise.
 * ASSUMPTIONS:
 * - Required: item, batch, quantity, unit, expiry date. Strength and form may be empty.
 * - Quantity is a whole number ≥ 1 (units as counted on the shelf).
 * - Dates: YYYY-MM-DD, DD/MM/YYYY or a real spreadsheet date (Gregorian calendar).
 * - At most 2 000 rows per file; the same item + strength + form + batch may appear only once in a file.
 */

export const MAX_IMPORT_ROWS = 2000;
export const STOCK_COLUMNS = [
  "item",
  "strength",
  "form",
  "batch",
  "quantity",
  "unit",
  "expiry_date",
] as const;
export type StockColumn = (typeof STOCK_COLUMNS)[number];

/** The only accepted column names (owner decision 11 Oct 2026); "expiry_date" is the same name written with "_". */
const HEADER_ALIASES: Record<string, StockColumn> = {
  item: "item",
  strength: "strength",
  form: "form",
  batch: "batch",
  quantity: "quantity",
  unit: "unit",
  "expiry date": "expiry_date",
};

const normalizeHeader = (h: string) =>
  h.replace(/^﻿/, "").trim().toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ");

/** A stock line as entered by hand or read from a file. */
export const stockLineSchema = z.object({
  item: z.string().trim().min(1, "Item is required").max(120, "Item: at most 120 characters"),
  strength: z.string().trim().max(60, "Strength: at most 60 characters").default(""),
  form: z.string().trim().max(60, "Form: at most 60 characters").default(""),
  batch: z.string().trim().min(1, "Batch is required").max(60, "Batch: at most 60 characters"),
  quantity: z.coerce
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(10_000_000, "Quantity is too large"),
  unit: z.string().trim().min(1, "Unit is required").max(30, "Unit: at most 30 characters"),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must be a date")
    .refine((d) => isRealDate(d), "Expiry date is not a real date"),
});
export type StockLineInput = z.infer<typeof stockLineSchema>;

/** Identity of a line inside a facility (re-uploading the same batch replaces its quantity). */
export const stockLineKey = (l: Pick<StockLineInput, "item" | "strength" | "form" | "batch">) =>
  [l.item, l.strength, l.form, l.batch].map((v) => v.trim().toLowerCase()).join("|");

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** A date cell or text → "YYYY-MM-DD", or the text unchanged (validation then reports it). */
export function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return text;
}

/** Parses CSV text: quotes, doubled quotes, CRLF, a UTF-8 BOM, and ";" as separator (some Excel exports). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface PreviewRow {
  /** Row number in the file (the header is row 1). */
  row: number;
  values: Record<StockColumn, string>;
  line: StockLineInput | null;
  errors: string[];
}

export interface ImportPreview {
  rows: PreviewRow[];
  /** Problems with the file itself (missing columns, too many rows, empty file). */
  fileErrors: string[];
  validCount: number;
  errorCount: number;
}

/** Checks a table (first row = headers) and returns every row with its errors. */
export function previewTable(table: unknown[][]): ImportPreview {
  const fileErrors: string[] = [];
  if (table.length === 0) {
    return { rows: [], fileErrors: ["The file is empty."], validCount: 0, errorCount: 0 };
  }
  const header = table[0].map((h) => HEADER_ALIASES[normalizeHeader(String(h ?? ""))] ?? null);
  const index = {} as Record<StockColumn, number>;
  for (const col of STOCK_COLUMNS) index[col] = header.indexOf(col);
  const missing = (["item", "batch", "quantity", "unit", "expiry_date"] as StockColumn[]).filter(
    (c) => index[c] < 0
  );
  if (missing.length) {
    fileErrors.push(
      `Missing column(s): ${missing.map((c) => c.replace("_", " ")).join(", ")}. The first row must name the columns.`
    );
    return { rows: [], fileErrors, validCount: 0, errorCount: 0 };
  }
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`Too many rows (${body.length}); at most ${MAX_IMPORT_ROWS} per file.`);
    return { rows: [], fileErrors, validCount: 0, errorCount: 0 };
  }
  if (body.length === 0) fileErrors.push("The file has no stock lines under the header.");

  const seen = new Map<string, number>();
  const rows: PreviewRow[] = body.map((cells, i) => {
    const get = (c: StockColumn) => (index[c] >= 0 ? cells[index[c]] : "");
    const values = {} as Record<StockColumn, string>;
    for (const c of STOCK_COLUMNS) {
      const v = get(c);
      values[c] = c === "expiry_date" ? toIsoDate(v) : String(v ?? "").trim();
    }
    const parsed = stockLineSchema.safeParse({
      item: values.item,
      strength: values.strength,
      form: values.form,
      batch: values.batch,
      quantity: values.quantity === "" ? undefined : values.quantity,
      unit: values.unit,
      expiryDate: values.expiry_date,
    });
    const rowNo = i + 2;
    const errors = parsed.success ? [] : parsed.error.issues.map((x) => x.message);
    if (parsed.success) {
      const key = stockLineKey(parsed.data);
      const first = seen.get(key);
      if (first) errors.push(`Same item, strength, form and batch as row ${first}`);
      else seen.set(key, rowNo);
    }
    return {
      row: rowNo,
      values,
      line: parsed.success && errors.length === 0 ? parsed.data : null,
      errors,
    };
  });
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  return { rows, fileErrors, validCount: rows.length - errorCount, errorCount };
}

/**
 * Expiry thresholds reached by a line on `today` (CLAUDE.md §12): every configured threshold T with
 * days-left ≤ T, plus 0 (the expiry day) once expired. Returned from the largest to the smallest.
 */
export function reachedThresholds(
  expiryDate: string,
  today: string,
  thresholds: number[]
): number[] {
  const days = daysUntil(expiryDate, today);
  return Array.from(new Set([...thresholds, 0]))
    .filter((t) => days <= t)
    .sort((a, b) => b - a);
}

/** Whole days from `today` to `date` (both "YYYY-MM-DD"); negative when the date has passed. */
export function daysUntil(date: string, today: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(date) - utc(today)) / 86_400_000);
}
