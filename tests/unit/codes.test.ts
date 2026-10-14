import { describe, expect, it } from "vitest";
import {
  CODE_KINDS,
  codePeriod,
  containerCode,
  formatCode,
  isCode,
  maxSequence,
} from "@/lib/codes";

describe("human codes (CLAUDE.md §9)", () => {
  const at = new Date("2026-10-04T09:00:00Z");

  it("formats the examples from CLAUDE.md", () => {
    expect(formatCode("waste", codePeriod("waste", at), 42)).toBe("WR-2610-00042");
    expect(formatCode("trip", codePeriod("trip", at), 1)).toBe("TR-261004-01");
    expect(formatCode("certificate", codePeriod("certificate", at), 17)).toBe("CD-2026-00017");
    expect(formatCode("invoice", codePeriod("invoice", at), 31)).toBe("INV-2026-10-0031");
    expect(formatCode("contract", codePeriod("contract", at), 7)).toBe("CT-2026-0007");
    expect(containerCode("WR-2610-00042", 3)).toBe("WR-2610-00042-C03");
    expect(containerCode("WR-2610-00042", 120)).toBe("WR-2610-00042-C120");
  });

  it("every generated code matches its own pattern", () => {
    for (const kind of CODE_KINDS) {
      const code = formatCode(kind, codePeriod(kind, at), maxSequence(kind));
      expect(isCode(kind, code), code).toBe(true);
    }
  });

  it("periods follow EAT (UTC+3), not UTC", () => {
    // 31 Dec 2026 22:30 UTC is already 1 Jan 2027 01:30 in Addis Ababa.
    const newYear = new Date("2026-12-31T22:30:00Z");
    expect(codePeriod("waste", newYear)).toBe("2701");
    expect(codePeriod("trip", newYear)).toBe("270101");
    expect(codePeriod("invoice", newYear)).toBe("2027-01");
    expect(codePeriod("certificate", newYear)).toBe("2027");
    // 20:59 UTC is still 23:59 the same day in EAT.
    expect(codePeriod("trip", new Date("2026-10-04T20:59:00Z"))).toBe("261004");
    expect(codePeriod("trip", new Date("2026-10-04T21:00:00Z"))).toBe("261005");
  });

  it("refuses numbers outside the period's range", () => {
    expect(maxSequence("trip")).toBe(99);
    expect(maxSequence("waste")).toBe(99_999);
    expect(() => formatCode("trip", "261004", 100)).toThrow(RangeError);
    expect(() => formatCode("waste", "2610", 0)).toThrow(RangeError);
    expect(() => formatCode("waste", "2610", 1.5)).toThrow(RangeError);
    expect(() => containerCode("WR-2610-00042", 0)).toThrow(RangeError);
    expect(() => containerCode("WR-2610-00042", 1000)).toThrow(RangeError);
    expect(() => containerCode("WST-1", 1)).toThrow(RangeError);
  });

  it("isCode rejects look-alikes", () => {
    expect(isCode("waste", "WR-2610-0042")).toBe(false);
    expect(isCode("contract", "CTR-2025-DD01")).toBe(false);
    expect(isCode("invoice", "INV-2026-10-31")).toBe(false);
  });
});
