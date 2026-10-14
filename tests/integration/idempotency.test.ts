import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { purgeExpiredIdempotencyKeys, withIdempotency } from "@/server/idempotency/store";
import { closeTestPool, inCommittedTransaction, inRolledBackDrizzle, testPool } from "./db";

const ROUTE = "TEST /idempotency";
afterAll(async () => {
  await testPool().query(`DELETE FROM idempotency_keys WHERE route LIKE 'TEST %'`);
  await closeTestPool();
});

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

describe("withIdempotency (Gate 2.7)", () => {
  it("runs once; a replay returns the stored response without running again", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      let runs = 0;
      const call = () =>
        withIdempotency(
          tx,
          { key, userId: null, route: ROUTE, request: { stop: "s1" } },
          async () => {
            runs += 1;
            return {
              status: 201,
              body: { otpIssued: true, attemptsLeft: 5, at: "2026-10-09T08:00:00Z" },
            };
          }
        );
      const first = await call();
      const second = await call();
      expect(runs).toBe(1);
      expect(first).toMatchObject({ status: 201, replayed: false });
      expect(second).toEqual({ ...first, replayed: true });
    }));

  it("the same key with a different request → 422; a missing key → 400", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      const ok = async () => ({ status: 200, body: { ok: true } });
      await withIdempotency(tx, { key, userId: null, route: ROUTE, request: { n: 1 } }, ok);
      expect(
        await codeOf(
          withIdempotency(tx, { key, userId: null, route: ROUTE, request: { n: 2 } }, ok)
        )
      ).toBe("422 IDEMPOTENCY_KEY_REUSED");
      expect(
        await codeOf(
          withIdempotency(tx, { key: undefined, userId: null, route: ROUTE, request: {} }, ok)
        )
      ).toBe("400 IDEMPOTENCY_KEY_REQUIRED");
    }));

  it("keys are per user and per route", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      const users = (
        await tx.execute(sql`SELECT id FROM users WHERE clerk_user_id LIKE 'dev_%' LIMIT 2`)
      ).rows as { id: string }[];
      let runs = 0;
      const run = async () => ({ status: 200, body: { run: ++runs } });
      await withIdempotency(tx, { key, userId: users[0].id, route: ROUTE, request: {} }, run);
      await withIdempotency(tx, { key, userId: users[1].id, route: ROUTE, request: {} }, run);
      await withIdempotency(
        tx,
        { key, userId: users[0].id, route: `${ROUTE}/other`, request: {} },
        run
      );
      expect(runs).toBe(3);
    }));

  it("a failed action leaves no key behind, so the retry runs the action", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      const scope = { key, userId: null, route: ROUTE, request: {} };
      // The action fails inside its transaction (here a savepoint) → key and action roll back together.
      const failed = tx.transaction(async (inner) =>
        withIdempotency(inner, scope, async () => {
          throw new AppError("INVALID_TRANSITION", 409);
        })
      );
      expect(await codeOf(failed)).toBe("409 INVALID_TRANSITION");
      const retry = await withIdempotency(tx, scope, async () => ({
        status: 200,
        body: { ok: true },
      }));
      expect(retry.replayed).toBe(false);
    }));

  it("a key older than 24 h is forgotten; the daily purge removes old keys", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      const scope = { key, userId: null, route: ROUTE, request: {} };
      await withIdempotency(tx, scope, async () => ({ status: 200, body: { v: 1 } }));
      await tx.execute(
        sql`UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE key = ${key}`
      );
      const again = await withIdempotency(tx, scope, async () => ({ status: 200, body: { v: 2 } }));
      expect(again).toEqual({ status: 200, body: { v: 2 }, replayed: false });

      await tx.execute(
        sql`UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE key = ${key}`
      );
      expect(await purgeExpiredIdempotencyKeys(tx)).toBeGreaterThanOrEqual(1);
    }));

  it("5 concurrent retries of the same request: the action runs once, all get the same response", async () => {
    const key = randomUUID();
    let runs = 0;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        inCommittedTransaction((tx) =>
          withIdempotency(
            tx,
            { key, userId: null, route: `${ROUTE} concurrent`, request: { s: 1 } },
            async () => {
              runs += 1;
              await tx.execute(sql`SELECT pg_sleep(0.3)`); // keep the first transaction open while others arrive
              return { status: 201, body: { done: true } };
            }
          )
        )
      )
    );
    expect(runs).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    for (const r of results) expect([r.status, r.body]).toEqual([201, { done: true }]);
  });
});
