import { describe, expect, it } from "vitest";
import { etbToSantim, formatEtb } from "@/lib/money";

describe("money helpers", () => {
  it("converts ETB to integer santim without float drift", () => {
    expect(etbToSantim(38500)).toBe(3_850_000);
    expect(etbToSantim(0.1 + 0.2)).toBe(30);
    expect(Number.isInteger(etbToSantim(12.345))).toBe(true);
  });

  it("formats santim as ETB with grouping and at most 2 decimals", () => {
    expect(formatEtb(3_850_000)).toBe("38,500 ETB");
    expect(formatEtb(1_234_567)).toBe("12,345.67 ETB");
    expect(formatEtb(0)).toBe("0 ETB");
  });
});
