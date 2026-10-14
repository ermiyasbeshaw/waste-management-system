import { describe, expect, it } from "vitest";
import { parseIdempotencyKey } from "@/lib/idempotency/key";
import { AppError } from "@/server/errors";
import { requestHash, requireIdempotencyKey } from "@/server/idempotency/store";

describe("Idempotency-Key header (CLAUDE.md §6)", () => {
  it("accepts a UUID (any case, trimmed) and normalises it to lower case", () => {
    expect(parseIdempotencyKey(" 0190A1B2-3C4D-7E5F-8A9B-0C1D2E3F4A5B ")).toBe(
      "0190a1b2-3c4d-7e5f-8a9b-0c1d2e3f4a5b"
    );
  });

  it("rejects missing or non-UUID keys with 400 IDEMPOTENCY_KEY_REQUIRED", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "abc",
      "12345678-1234-1234-1234-1234567890",
      "x".repeat(36),
    ]) {
      expect(parseIdempotencyKey(bad)).toBeNull();
      try {
        requireIdempotencyKey(bad);
        throw new Error("expected a refusal");
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect([(e as AppError).code, (e as AppError).httpStatus]).toEqual([
          "IDEMPOTENCY_KEY_REQUIRED",
          400,
        ]);
      }
    }
  });

  it("the request hash ignores key order but not values or route", () => {
    const h = requestHash("POST /api/stops/:id/scan", { stopId: "s1", code: "WR-2610-00042-C01" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(
      requestHash("POST /api/stops/:id/scan", { code: "WR-2610-00042-C01", stopId: "s1" })
    ).toBe(h);
    expect(
      requestHash("POST /api/stops/:id/scan", { stopId: "s1", code: "WR-2610-00042-C02" })
    ).not.toBe(h);
    expect(
      requestHash("POST /api/stops/:id/skip", { stopId: "s1", code: "WR-2610-00042-C01" })
    ).not.toBe(h);
  });
});
