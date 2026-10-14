import { afterAll, describe, expect, it } from "vitest";
import { verifyAuditChain } from "@/server/audit/verify";
import { writeAudit } from "@/server/audit/writer";
import { AppError } from "@/server/errors";
import {
  closeTestPool,
  drizzleOn,
  inCommittedTransaction,
  inRolledBackDrizzle,
  inRolledBackTransaction,
  testPool,
} from "./db";

afterAll(closeTestPool);

const entry = (n: number) => ({
  actor: null,
  action: "test.concurrent_write",
  entityType: "test",
  entityId: `concurrency-${n}`,
  after: { n, at: new Date(), nested: { b: 2, a: 1 } },
  requestId: `test-${n}`,
});

describe("audit writer (Gate 2.5)", () => {
  // NOTE: audit rows can never be deleted, so these committed test rows stay on the dev branch
  // (entity_type = 'test'). Accepted on 9 Oct 2026 until a separate Neon test branch exists.
  it("50 concurrent writers produce one unbroken chain", async () => {
    const before = await testPool().query(`SELECT count(*)::int AS n FROM audit_logs`);
    const written = await Promise.all(
      Array.from({ length: 50 }, (_, i) => inCommittedTransaction((tx) => writeAudit(tx, entry(i))))
    );
    expect(new Set(written.map((w) => w.hash)).size).toBe(50);

    const result = await verifyAuditChain(drizzleOn(testPool()));
    expect(result).toEqual({ ok: true, checked: before.rows[0].n + 50 });
  }, 180_000); // 50 serialised round trips to Neon can take over 30 s on a slow link

  it("the audit row rolls back with the business change", async () => {
    const count = async () =>
      (await testPool().query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0].n as number;
    const n = await count();
    await inRolledBackDrizzle(async (tx) => {
      await writeAudit(tx, entry(999));
      expect(await verifyAuditChain(tx)).toMatchObject({ ok: true, checked: n + 1 });
    });
    expect(await count()).toBe(n);
  });

  it("refuses entries that contain secrets", () =>
    inRolledBackDrizzle(async (tx) => {
      const err = await writeAudit(tx, {
        actor: null,
        action: "otp.issued",
        entityType: "otp_code",
        after: { status: "ISSUED", code_hash: "x".repeat(64) },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("AUDIT_SECRET_FIELD");
    }));
});

describe("verifyAuditChain detects tampering", () => {
  // The append-only trigger blocks edits, so the tamper is simulated by a database owner who disables it —
  // inside a transaction that is rolled back.
  async function tamper(sql: string) {
    let result: Awaited<ReturnType<typeof verifyAuditChain>> | undefined;
    let target = 0;
    await inRolledBackTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT seq FROM audit_logs ORDER BY seq OFFSET 1 LIMIT 1` // the 2nd row: not the first entry
      );
      target = Number(rows[0].seq);
      await c.query(`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`);
      await c.query(sql, [target]);
      result = await verifyAuditChain(drizzleOn(c));
    });
    return { result, target };
  }

  it("a changed field breaks that row's hash", async () => {
    const { result, target } = await tamper(
      `UPDATE audit_logs SET action = 'test.tampered' WHERE seq = $1`
    );
    expect(result).toMatchObject({ ok: false, brokenSeq: target, reason: "hash_mismatch" });
  });

  it("a deleted row breaks the link of the next row", async () => {
    const { result, target } = await tamper(`DELETE FROM audit_logs WHERE seq = $1`);
    expect(result).toMatchObject({ ok: false, reason: "prev_hash_mismatch" });
    expect((result as { brokenSeq: number }).brokenSeq).toBeGreaterThan(target);
  });
});
