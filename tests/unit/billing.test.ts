import { describe, expect, it } from "vitest";
import {
  contractStatusOn,
  dueDate,
  invoiceAmounts,
  isBillableMonth,
  monthPeriod,
  previousMonth,
  vatSantim,
} from "@/lib/billing";

/** Gate 6: money / VAT and billing periods (CLAUDE.md §10 unit list: money/VAT, dates). */

describe("VAT and totals (santim)", () => {
  it("15 % of 1 000.00 ETB is 150.00 ETB", () => {
    expect(invoiceAmounts(100_000, 15)).toEqual({
      subtotalSantim: 100_000,
      vatSantim: 15_000,
      totalSantim: 115_000,
    });
  });

  it("rounds half up to the santim", () => {
    expect(vatSantim(1, 50)).toBe(1); // 0.5 santim → 1
    expect(vatSantim(3, 15)).toBe(0); // 0.45 → 0
    expect(vatSantim(10, 15)).toBe(2); // 1.5 → 2
    expect(vatSantim(0, 15)).toBe(0);
  });

  it("refuses fractions of a santim, negative amounts and rates outside 0–100", () => {
    expect(() => vatSantim(10.5, 15)).toThrow();
    expect(() => vatSantim(-1, 15)).toThrow();
    expect(() => vatSantim(100, 101)).toThrow();
    expect(() => vatSantim(100, -1)).toThrow();
  });
});

describe("billing periods", () => {
  it("month boundaries, including February in a leap year", () => {
    expect(monthPeriod("2026-10")).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    expect(monthPeriod("2028-02")).toEqual({ periodStart: "2028-02-01", periodEnd: "2028-02-29" });
    expect(monthPeriod("2026-02").periodEnd).toBe("2026-02-28");
    expect(() => monthPeriod("2026-13")).toThrow();
    expect(() => monthPeriod("26-10")).toThrow();
  });

  it("previous month wraps the year", () => {
    expect(previousMonth("2026-10-10")).toBe("2026-09");
    expect(previousMonth("2027-01-01")).toBe("2026-12");
  });

  it("a month is billed when it starts inside the contract", () => {
    expect(isBillableMonth("2026-10", "2026-01-01", "2027-01-01")).toBe(true);
    expect(isBillableMonth("2026-10", "2026-10-01", "2026-11-01")).toBe(true);
    expect(isBillableMonth("2026-10", "2026-10-15", "2027-01-01")).toBe(false); // starts mid-month
    expect(isBillableMonth("2027-01", "2026-01-01", "2027-01-01")).toBe(false); // ended
  });
});

describe("due dates and contract status", () => {
  it("due date = issue date + days, across month ends", () => {
    expect(dueDate("2026-10-10", 30)).toBe("2026-11-09");
    expect(dueDate("2026-12-15", 30)).toBe("2027-01-14");
  });

  it("ACTIVE → EXPIRING_SOON within the warning window → EXPIRED at the end date", () => {
    expect(contractStatusOn("2026-10-10", "2027-01-01", 30)).toBe("ACTIVE");
    expect(contractStatusOn("2026-12-02", "2027-01-01", 30)).toBe("EXPIRING_SOON");
    expect(contractStatusOn("2026-12-31", "2027-01-01", 30)).toBe("EXPIRING_SOON");
    expect(contractStatusOn("2027-01-01", "2027-01-01", 30)).toBe("EXPIRED");
  });
});
