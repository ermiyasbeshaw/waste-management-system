import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  daysBetween,
  eatMonthRange,
  formatDate,
  formatDateTime,
  formatTime,
  toEatDateString,
} from "@/lib/dates";
import { maskPhone, redact } from "@/lib/redact";
import { AppError, toErrorBody } from "@/server/errors";

describe("dates (EAT, UTC+3)", () => {
  it("formats UTC instants in Addis Ababa time", () => {
    // 21:30 UTC on 30 Sep is 00:30 on 1 Oct in EAT.
    const iso = "2026-09-30T21:30:00Z";
    expect(formatDate(iso)).toBe("1 Oct 2026");
    expect(formatTime(iso)).toBe("00:30");
    expect(formatDateTime(iso)).toBe("1 Oct 2026, 00:30");
    expect(toEatDateString(iso)).toBe("2026-10-01");
  });

  it("puts month boundaries at EAT midnight, not UTC midnight", () => {
    const { start, end, label } = eatMonthRange("2026-10-15T12:00:00Z");
    expect(start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(label).toBe("October 2026");
    // The last minute of September in EAT belongs to September.
    expect(eatMonthRange("2026-09-30T20:59:00Z").label).toBe("September 2026");
  });

  it("handles the December → January boundary", () => {
    const { start, end } = eatMonthRange("2026-12-31T20:00:00Z");
    expect(start.toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("counts whole days and rejects invalid dates", () => {
    expect(daysBetween("2026-10-01T00:00:00Z", "2026-10-04T23:00:00Z")).toBe(3);
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });
});

describe("redaction for logs", () => {
  it("masks phone numbers but keeps them recognisable", () => {
    expect(maskPhone("+251911457820")).toBe("+2519******20");
    expect(maskPhone("0911457820")).toBe("0911****20");
    expect(maskPhone("12")).toBe("***");
  });

  it("removes OTPs, tokens, passwords and secrets by key", () => {
    const out = redact({
      otp: "482913",
      codeHash: "abc",
      deviceToken: "t0k3n",
      password: "pw",
      CLERK_SECRET_KEY: "sk_test_x",
      headers: { Authorization: "Bearer abc.def" },
      phone_e164: "+251911457820",
      facility: "DD-REF-001",
    }) as Record<string, unknown>;
    expect(out.otp).toBe("[REDACTED]");
    expect(out.codeHash).toBe("[REDACTED]");
    expect(out.deviceToken).toBe("[REDACTED]");
    expect(out.password).toBe("[REDACTED]");
    expect(out.CLERK_SECRET_KEY).toBe("[REDACTED]");
    expect((out.headers as Record<string, unknown>).Authorization).toBe("[REDACTED]");
    expect(out.phone_e164).toBe("+2519******20");
    expect(out.facility).toBe("DD-REF-001");
  });

  it("scrubs secrets and phone numbers inside free text", () => {
    const text = redact(
      "SMS to +251 91 145 7820 failed; db postgresql://u:p@host/db; key sk_test_abc123; Bearer xyz.abc"
    ) as string;
    expect(text).not.toContain("145 7820");
    expect(text).not.toContain("u:p@host");
    expect(text).not.toContain("sk_test_abc123");
    expect(text).not.toContain("xyz.abc");
    expect(text).toContain("[REDACTED_DB_URL]");
  });
});

describe("AppError and the API error format", () => {
  it("uses the default status for known codes", () => {
    const { status, body } = toErrorBody(new AppError("INVALID_TRANSITION"));
    expect(status).toBe(409);
    expect(body).toEqual({
      error: {
        code: "INVALID_TRANSITION",
        message: "This status change is not allowed.",
        details: {},
      },
    });
  });

  it("keeps an explicit status, message and details", () => {
    const { status, body } = toErrorBody(
      new AppError("OTP_EXPIRED", 400, "The code has expired.", { attemptsLeft: 2 })
    );
    expect(status).toBe(400);
    expect(body.error).toEqual({
      code: "OTP_EXPIRED",
      message: "The code has expired.",
      details: { attemptsLeft: 2 },
    });
  });

  it("turns zod errors into 422 with field messages", () => {
    const parsed = z
      .object({ weightKg: z.number().positive("Weight must be more than 0") })
      .safeParse({
        weightKg: 0,
      });
    const { status, body } = toErrorBody(parsed.success ? null : parsed.error);
    expect(status).toBe(422);
    expect(body.error.details).toEqual({ fields: { weightKg: "Weight must be more than 0" } });
  });

  it("hides unexpected errors behind a generic 500", () => {
    const { status, body } = toErrorBody(new Error("connection refused at 10.0.0.5"));
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });
});
