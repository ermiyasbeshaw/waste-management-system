import { describe, expect, it } from "vitest";
import { ingestSchema, MAX_POINTS_PER_REQUEST } from "@/lib/validation/tracking";
import { genericJsonProvider } from "@/server/integrations/tracking/provider";
import { createRateLimiter } from "@/server/rate-limit";

/** Gate 4.1: tracker request parsing (generic format), point validation and the rate limiter. */

const token = "A".repeat(43);
const req = (headers: Record<string, string>, body: unknown) =>
  new Request("http://localhost/api/tracking/v1/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const good = { points: [{ lat: 9.6, lng: 41.85, recordedAt: "2026-10-10T08:00:00Z" }] };
const status = async (p: Promise<unknown>) =>
  p.then(
    () => 0,
    (e: { httpStatus?: number; issues?: unknown }) => e.httpStatus ?? (e.issues ? 422 : -1)
  );

describe("generic tracker request", () => {
  it("reads device ID, bearer token and points", async () => {
    const r = await genericJsonProvider.parse(
      req({ "x-device-id": "TRK-A48291", authorization: `Bearer ${token}` }, good)
    );
    expect(r).toEqual({ deviceId: "TRK-A48291", token, points: good.points });
  });

  it("refuses missing or malformed credentials (401) and bad JSON (400)", async () => {
    expect(
      await status(genericJsonProvider.parse(req({ authorization: `Bearer ${token}` }, good)))
    ).toBe(401);
    expect(await status(genericJsonProvider.parse(req({ "x-device-id": "TRK-1" }, good)))).toBe(
      401
    );
    expect(
      await status(
        genericJsonProvider.parse(
          req({ "x-device-id": "bad id!", authorization: `Bearer ${token}` }, good)
        )
      )
    ).toBe(401);
    expect(
      await status(
        genericJsonProvider.parse(
          req({ "x-device-id": "TRK-1", authorization: `Bearer ${token}` }, "{nope")
        )
      )
    ).toBe(400);
  });
});

describe("GPS point rules", () => {
  it("accepts a valid point with optional speed and heading", () => {
    expect(
      ingestSchema.safeParse({ points: [{ ...good.points[0], speedKmh: 30, heading: 359.9 }] })
        .success
    ).toBe(true);
  });

  it.each([
    ["latitude out of range", { lat: 91 }],
    ["longitude out of range", { lng: -181 }],
    ["negative speed", { speedKmh: -1 }],
    ["heading 360", { heading: 360 }],
    ["time without zone", { recordedAt: "2026-10-10 08:00" }],
  ])("refuses %s", (_name, change) => {
    expect(ingestSchema.safeParse({ points: [{ ...good.points[0], ...change }] }).success).toBe(
      false
    );
  });

  it(`needs 1 to ${MAX_POINTS_PER_REQUEST} points`, () => {
    expect(ingestSchema.safeParse({ points: [] }).success).toBe(false);
    const many = Array.from({ length: MAX_POINTS_PER_REQUEST + 1 }, () => good.points[0]);
    expect(ingestSchema.safeParse({ points: many }).success).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows `limit` hits per window per key, then 429 until the window resets", () => {
    const l = createRateLimiter({ limit: 2, windowMs: 1000 });
    l.hit("a", 0);
    l.hit("a", 10);
    expect(() => l.hit("a", 20)).toThrow(expect.objectContaining({ httpStatus: 429 }));
    l.hit("b", 20); // other keys are independent
    l.hit("a", 1000); // new window
  });
});
