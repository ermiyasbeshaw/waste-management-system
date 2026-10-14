import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  daysUntil,
  parseCsv,
  previewTable,
  reachedThresholds,
  toIsoDate,
} from "@/lib/stock-import";
import { readXlsxTable } from "@/server/integrations/xlsx";

/** Gate 8: medicine stock import (CSV / XLSX parsing, row errors) and expiry thresholds (CLAUDE.md §12). */

const HEADER = "item,strength,form,batch,quantity,unit,expiry date";

describe("CSV", () => {
  it("reads quotes, doubled quotes, CRLF and a BOM", () => {
    const text = `﻿${HEADER}\r\n"Paracetamol, oral",500 mg,tablet,B-1,100,tab,2027-01-31\r\n"Say ""hi""",,,B-2,5,box,2027-02-01\r\n`;
    expect(parseCsv(text)).toEqual([
      ["item", "strength", "form", "batch", "quantity", "unit", "expiry date"],
      ["Paracetamol, oral", "500 mg", "tablet", "B-1", "100", "tab", "2027-01-31"],
      ['Say "hi"', "", "", "B-2", "5", "box", "2027-02-01"],
    ]);
  });

  it("detects ';' as the separator (some Excel CSV exports) and skips empty lines", () => {
    expect(parseCsv("item;batch\nAmoxicillin;A1\n\n")).toEqual([
      ["item", "batch"],
      ["Amoxicillin", "A1"],
    ]);
  });
});

describe("preview", () => {
  it("accepts good rows in any column order and case, with DD/MM/YYYY dates", () => {
    const p = previewTable([
      ["Expiry_Date", "ITEM", "Batch", "Quantity", "Unit", "Strength", "Form"],
      ["31/03/2027", "Amoxicillin", "AMX-9", "40", "capsule", "250 mg", "capsule"],
    ]);
    expect(p.fileErrors).toEqual([]);
    expect(p.rows[0].line).toEqual({
      item: "Amoxicillin",
      strength: "250 mg",
      form: "capsule",
      batch: "AMX-9",
      quantity: 40,
      unit: "capsule",
      expiryDate: "2027-03-31",
    });
    expect([p.validCount, p.errorCount]).toEqual([1, 0]);
  });

  it("reports an error per row (row number = line in the file) and duplicates inside the file", () => {
    const p = previewTable([
      HEADER.split(","),
      ["Ibuprofen", "", "", "IB-1", "ten", "tab", "2027-01-01"],
      ["", "", "", "IB-2", "5", "tab", "2027-01-01"],
      ["Ibuprofen", "", "", "IB-3", "5", "tab", "2027-02-30"],
      ["Ibuprofen", "", "", "IB-4", "5", "tab", "2027-03-01"],
      ["ibuprofen", "", "", "ib-4", "7", "tab", "2027-03-01"],
    ]);
    expect(p.rows.map((r) => [r.row, r.errors.length > 0])).toEqual([
      [2, true],
      [3, true],
      [4, true],
      [5, false],
      [6, true],
    ]);
    expect(p.rows[0].errors[0]).toMatch(/number/);
    expect(p.rows[1].errors[0]).toMatch(/Item is required/);
    expect(p.rows[2].errors[0]).toMatch(/not a real date/);
    expect(p.rows[4].errors[0]).toMatch(/row 5/);
    expect([p.validCount, p.errorCount]).toEqual([1, 4]);
  });

  it("accepts only the agreed column names (owner decision 11 Oct 2026)", () => {
    const p = previewTable([
      ["medicine", "batch no", "qty", "unit", "expiry"],
      ["Amoxicillin", "A1", "4", "box", "2027-01-01"],
    ]);
    expect(p.fileErrors[0]).toMatch(/Missing column\(s\): item, batch, quantity, expiry date/);
  });

  it("refuses a file without the required columns, or with no lines", () => {
    expect(previewTable([["item", "quantity"]]).fileErrors[0]).toMatch(
      /Missing column\(s\): batch, unit, expiry date/
    );
    expect(previewTable([HEADER.split(",")]).fileErrors[0]).toMatch(/no stock lines/);
    expect(previewTable([]).fileErrors[0]).toMatch(/empty/);
  });

  it("normalises dates", () => {
    expect(toIsoDate("2027-3-5")).toBe("2027-03-05");
    expect(toIsoDate("5/3/2027")).toBe("2027-03-05");
    expect(toIsoDate(new Date(Date.UTC(2027, 2, 5)))).toBe("2027-03-05");
    expect(toIsoDate("March 2027")).toBe("March 2027"); // left as is → reported as an error
  });
});

describe("XLSX", () => {
  it("reads the first sheet, including real date cells, into the same preview", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Stock");
    ws.addRow(["Item", "Strength", "Form", "Batch", "Quantity", "Unit", "Expiry date"]);
    ws.addRow([
      "Ceftriaxone",
      "1 g",
      "vial",
      "CF-77",
      12,
      "vial",
      new Date(Date.UTC(2026, 11, 31)),
    ]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const p = previewTable(await readXlsxTable(bytes));
    expect(p.errorCount).toBe(0);
    expect(p.rows[0].line).toMatchObject({
      item: "Ceftriaxone",
      quantity: 12,
      expiryDate: "2026-12-31",
    });
  });
});

describe("expiry thresholds", () => {
  const T = [90, 30, 7];
  it("counts days on the calendar", () => {
    expect(daysUntil("2026-10-21", "2026-10-11")).toBe(10);
    expect(daysUntil("2026-10-01", "2026-10-11")).toBe(-10);
  });

  it("reaches 90 / 30 / 7 days and the expiry day, largest first", () => {
    expect(reachedThresholds("2027-06-01", "2026-10-11", T)).toEqual([]);
    expect(reachedThresholds("2026-12-01", "2026-10-11", T)).toEqual([90]);
    expect(reachedThresholds("2026-10-31", "2026-10-11", T)).toEqual([90, 30]);
    expect(reachedThresholds("2026-10-15", "2026-10-11", T)).toEqual([90, 30, 7]);
    expect(reachedThresholds("2026-10-11", "2026-10-11", T)).toEqual([90, 30, 7, 0]);
    expect(reachedThresholds("2026-09-01", "2026-10-11", T)).toEqual([90, 30, 7, 0]);
  });
});
