import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DbExecutor } from "@/server/db/executor";
import type { MessagingProviders } from "@/server/integrations/messaging";
import { isValidCronAuth } from "@/server/jobs/cron-auth";
import { dispatchPending } from "@/server/outbox/dispatcher";
import { enqueueMessage } from "@/server/outbox/enqueue";
import { closeTestPool, inRolledBackDrizzle, testPool } from "./db";

afterAll(closeTestPool);

/**
 * Other tests on this branch leave messages queued (immediate sending is off during tests). Send them first, so
 * each test here only sees its own messages.
 */
beforeEach(async () => {
  const { providers } = fakeProviders();
  for (;;) {
    const r = await dispatchPending({
      providers,
      limit: 200,
      now: () => new Date(Date.now() + 365 * 86_400_000),
      keyHex: KEY,
    });
    if (r.sent + r.failed + r.expired + r.retrying === 0) break;
  }
}, 600_000); // after a full run hundreds of messages may be waiting; each one is a few round trips to Neon

const KEY = process.env.OUTBOX_ENCRYPTION_KEY!;
const PHONE = "+251900000101"; // fictional

function fakeProviders(fail = false) {
  const sent: { to: string; text: string }[] = [];
  const providers: MessagingProviders = {
    sms: {
      name: "fake",
      async send(to, text) {
        if (fail) throw new Error("gateway timeout");
        sent.push({ to, text });
        return { providerRef: `fake-${sent.length}` };
      },
    },
    email: {
      name: "fake",
      async send() {
        if (fail) throw new Error("smtp down");
        return { providerRef: "fake-email" };
      },
    },
  };
  return { providers, sent };
}

async function row(tx: DbExecutor, id: string) {
  return (await tx.execute(sql`SELECT * FROM outbox_messages WHERE id = ${id}`)).rows[0] as Record<
    string,
    unknown
  >;
}

const otp = (expiresAt?: Date) => ({
  template: "otp.pickup" as const,
  recipient: PHONE,
  data: { facilityName: "Dil Chora Referral Hospital", expiresInMinutes: 10 },
  secrets: { code: "482913" },
  expiresAt: expiresAt ?? new Date(Date.now() + 10 * 60_000),
});

const soon = () => new Date(Date.now() + 2_000);

describe("outbox (Gate 2.8)", () => {
  it("a message enqueued in a rolled-back transaction does not exist", async () => {
    const count = async () =>
      (await testPool().query(`SELECT count(*)::int AS n FROM outbox_messages`)).rows[0]
        .n as number;
    const before = await count();
    await inRolledBackDrizzle(async (tx) => {
      await enqueueMessage(tx, otp(), KEY);
    });
    expect(await count()).toBe(before);
  });

  it("stores the OTP only encrypted; after sending, the secret is removed", () =>
    inRolledBackDrizzle(async (tx) => {
      const { id } = await enqueueMessage(tx, otp(), KEY);
      const pending = await row(tx, id);
      expect(pending).toMatchObject({ status: "PENDING", channel: "SMS", attempts: 0 });
      expect(JSON.stringify(pending)).not.toContain("482913");

      const { providers, sent } = fakeProviders();
      const summary = await dispatchPending({ executor: tx, providers, now: soon, keyHex: KEY });
      expect(summary).toEqual({ sent: 1, retrying: 0, failed: 0, expired: 0 });
      expect(sent).toEqual([{ to: PHONE, text: expect.stringContaining("482913") }]);

      const done = await row(tx, id);
      expect(done).toMatchObject({ status: "SENT", attempts: 1, provider_ref: "fake-1" });
      expect(done.sent_at).toBeTruthy();
      expect(done.payload).toEqual({
        data: { facilityName: "Dil Chora Referral Hospital", expiresInMinutes: 10 },
      });
    }));

  it("retries after 1 / 5 / 15 / 60 / 60 min, then FAILED at outbox_max_attempts (6)", () =>
    inRolledBackDrizzle(async (tx) => {
      const { id } = await enqueueMessage(
        tx,
        { template: "system.test_email", recipient: "Ops@Example.com", data: { note: "x" } },
        KEY
      );
      expect((await row(tx, id)).recipient).toBe("ops@example.com");
      const { providers } = fakeProviders(true);
      const delays: number[] = [];
      let clock = Date.now() + 2_000;
      for (let attempt = 1; attempt <= 6; attempt++) {
        const at = new Date(clock);
        await dispatchPending({ executor: tx, providers, now: () => at, keyHex: KEY });
        const r = await row(tx, id);
        expect(r.attempts).toBe(attempt);
        if (attempt < 6) {
          expect(r.status).toBe("PENDING");
          const next = new Date(r.next_attempt_at as string | Date).getTime();
          delays.push(Math.round((next - at.getTime()) / 60_000));
          // Not yet due one second before the next attempt time.
          const early = await dispatchPending({
            executor: tx,
            providers,
            now: () => new Date(next - 1_000),
            keyHex: KEY,
          });
          expect(early).toEqual({ sent: 0, retrying: 0, failed: 0, expired: 0 });
          clock = next;
        } else {
          expect(r).toMatchObject({ status: "FAILED", last_error: "smtp down" });
        }
      }
      expect(delays).toEqual([1, 5, 15, 60, 60]);
    }));

  it("an expired OTP is never sent or retried, and its secret is removed", () =>
    inRolledBackDrizzle(async (tx) => {
      const { id } = await enqueueMessage(tx, otp(new Date(Date.now() - 1_000)), KEY);
      const { providers, sent } = fakeProviders();
      const summary = await dispatchPending({ executor: tx, providers, now: soon, keyHex: KEY });
      expect(summary.expired).toBe(1);
      expect(sent).toHaveLength(0);
      const r = await row(tx, id);
      expect(r).toMatchObject({ status: "FAILED", last_error: "Expired before it was sent" });
      expect(JSON.stringify(r.payload)).not.toContain("sealed");
    }));

  it("refuses invalid recipients and missing secrets at enqueue time", () =>
    inRolledBackDrizzle(async (tx) => {
      await expect(enqueueMessage(tx, { ...otp(), recipient: "0911000000" }, KEY)).rejects.toThrow(
        /invalid SMS recipient/
      );
      await expect(enqueueMessage(tx, { ...otp(), secrets: {} }, KEY)).rejects.toThrow(
        /needs secret/
      );
    }));
});

describe("job authentication", () => {
  it("accepts only the exact bearer secret", () => {
    const secret = "s".repeat(40);
    expect(isValidCronAuth(`Bearer ${secret}`, secret)).toBe(true);
    for (const bad of [null, "", secret, `Bearer ${secret}x`, `bearer ${secret}`, "Bearer "]) {
      expect(isValidCronAuth(bad, secret)).toBe(false);
    }
  });
});
