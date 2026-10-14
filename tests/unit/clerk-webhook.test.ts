import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseClerkUserEvent,
  signClerkWebhook,
  verifyClerkWebhook,
  WEBHOOK_TOLERANCE_SECONDS,
} from "@/server/auth/clerk-webhook";

/** Gate 1b.8: Clerk (Svix) webhook signature check and user event parsing. */

const secret = `whsec_${randomBytes(24).toString("base64")}`;
const body = JSON.stringify({ type: "user.updated", data: { id: "user_1" } });
const now = 1_760_000_000;
const headersFor = (sig: string, ts = String(now), id = "msg_1") => ({
  id,
  timestamp: ts,
  signature: sig,
});

describe("Clerk webhook signature", () => {
  it("accepts a correct v1 signature (also among several)", () => {
    const sig = signClerkWebhook(secret, "msg_1", String(now), body);
    expect(verifyClerkWebhook(secret, headersFor(`v1,${sig}`), body, now)).toBe(true);
    expect(verifyClerkWebhook(secret, headersFor(`v1,AAAA v1,${sig}`), body, now)).toBe(true);
  });

  it("refuses a changed body, another secret, a missing header and an old or future timestamp", () => {
    const sig = signClerkWebhook(secret, "msg_1", String(now), body);
    expect(verifyClerkWebhook(secret, headersFor(`v1,${sig}`), `${body} `, now)).toBe(false);
    const other = `whsec_${randomBytes(24).toString("base64")}`;
    expect(verifyClerkWebhook(other, headersFor(`v1,${sig}`), body, now)).toBe(false);
    expect(
      verifyClerkWebhook(
        secret,
        { id: null, timestamp: String(now), signature: `v1,${sig}` },
        body,
        now
      )
    ).toBe(false);
    expect(verifyClerkWebhook(secret, headersFor(`v2,${sig}`), body, now)).toBe(false);
    const late = now + WEBHOOK_TOLERANCE_SECONDS + 1;
    expect(verifyClerkWebhook(secret, headersFor(`v1,${sig}`), body, late)).toBe(false);
  });
});

describe("Clerk user event", () => {
  const event = (type: string, phoneStatus = "verified") =>
    JSON.stringify({
      type,
      data: {
        id: "user_2",
        primary_email_address_id: "e2",
        email_addresses: [
          { id: "e1", email_address: "old@example.test" },
          { id: "e2", email_address: "main@example.test" },
        ],
        primary_phone_number_id: "p1",
        phone_numbers: [
          { id: "p1", phone_number: "+251911000111", verification: { status: phoneStatus } },
        ],
      },
    });

  it("takes the primary email and phone and the verification status", () => {
    expect(parseClerkUserEvent(event("user.updated"))).toEqual({
      type: "user.updated",
      clerkUserId: "user_2",
      email: "main@example.test",
      phoneE164: "+251911000111",
      phoneVerified: true,
    });
    expect(parseClerkUserEvent(event("user.updated", "unverified"))?.phoneVerified).toBe(false);
  });

  it("ignores other event types and broken bodies", () => {
    expect(parseClerkUserEvent(event("session.created"))).toBeNull();
    expect(parseClerkUserEvent("{not json")).toBeNull();
    expect(parseClerkUserEvent(JSON.stringify({ type: "user.updated", data: {} }))).toBeNull();
  });
});
