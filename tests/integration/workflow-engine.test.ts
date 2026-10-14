import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import { transition } from "@/server/workflow/engine";
import { ensure } from "@/server/workflow/guards";
import { closeTestPool, inCommittedTransaction, inRolledBackDrizzle, testPool } from "./db";

const cleanup: string[] = [];
/** Records this file commits use WR-9901-…; remove any left behind by an interrupted earlier run. */
const removeLeftovers = () =>
  testPool().query(
    `DELETE FROM waste_records w WHERE w.waste_code LIKE 'WR-9901-%'
       AND NOT EXISTS (SELECT 1 FROM containers c WHERE c.waste_record_id = w.id)
       AND NOT EXISTS (SELECT 1 FROM trip_stop_waste l WHERE l.waste_record_id = w.id)`
  );
beforeAll(removeLeftovers);
afterAll(async () => {
  if (cleanup.length) {
    await testPool().query(`DELETE FROM waste_records WHERE id = ANY($1::uuid[])`, [cleanup]);
  }
  await closeTestPool();
});

async function one<T = Record<string, unknown>>(tx: DbExecutor, q: ReturnType<typeof sql>) {
  return (await tx.execute(q)).rows[0] as T;
}

async function actor(tx: DbExecutor, role: Role): Promise<ActiveUser> {
  const u = await one<{ id: string; facility_id: string | null }>(
    tx,
    sql`SELECT id, facility_id FROM users WHERE clerk_user_id = ${`dev_${role}`}`
  );
  return { id: u.id, role, facilityId: u.facility_id, active: true };
}

let n = 0;
async function newWaste(tx: DbExecutor, status = "REGISTERED"): Promise<string> {
  n += 1;
  const code = `WR-9901-${String((Date.now() % 90000) + n).padStart(5, "0")}`;
  const row = await one<{ id: string }>(
    tx,
    sql`INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status)
        SELECT ${code}, u.facility_id, c.id, 1, 3.5, u.id, ${status}::waste_status
        FROM waste_categories c, users u
        WHERE c.code = 'INFECTIOUS' AND u.clerk_user_id = 'dev_hospital_staff'
        RETURNING id`
  );
  return row.id;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected the transition to be refused");
}

const status = (tx: DbExecutor, id: string) =>
  one<{ status: string }>(tx, sql`SELECT status FROM waste_records WHERE id = ${id}`).then(
    (r) => r.status
  );
const auditCount = (tx: DbExecutor, id: string) =>
  one<{ n: number }>(
    tx,
    sql`SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = ${id}`
  ).then((r) => r.n);

describe("Workflow Engine (Gate 2.6)", () => {
  it("an allowed move updates status + reason fields and writes one audit row", () =>
    inRolledBackDrizzle(async (tx) => {
      const id = await newWaste(tx);
      const staff = await actor(tx, "hospital_staff");
      const result = await transition(tx, {
        entity: "waste",
        id,
        to: "CANCELLED",
        actor: staff,
        reason: "  Registered twice  ",
        requestId: "req-test-1",
      });
      expect(result.from).toBe("REGISTERED");
      expect(result.row).toMatchObject({ status: "CANCELLED", cancel_reason: "Registered twice" });
      expect(result.row.cancelled_at).toBeTruthy();

      const audit = await one<{
        action: string;
        entity_type: string;
        role: string;
        before: unknown;
        after: Record<string, unknown>;
      }>(
        tx,
        sql`SELECT action, entity_type, role, before, after FROM audit_logs WHERE entity_id = ${id}`
      );
      expect(audit).toMatchObject({
        action: "waste.cancelled",
        entity_type: "waste_record",
        role: "hospital_staff",
        before: { status: "REGISTERED" },
        after: { status: "CANCELLED", reason: "Registered twice" },
      });
    }));

  it("a move outside the table → 409 INVALID_TRANSITION, nothing changed, nothing audited", () =>
    inRolledBackDrizzle(async (tx) => {
      const id = await newWaste(tx);
      const op = await actor(tx, "disposal_operator");
      expect(await codeOf(transition(tx, { entity: "waste", id, to: "DISPOSED", actor: op }))).toBe(
        "409 INVALID_TRANSITION"
      );
      expect(await status(tx, id)).toBe("REGISTERED");
      expect(await auditCount(tx, id)).toBe(0);
    }));

  it("efda_officer → 403; wrong role → 403; other facility → 403; missing reason → 422; unknown id → 404", () =>
    inRolledBackDrizzle(async (tx) => {
      const id = await newWaste(tx);
      const cancel = { entity: "waste" as const, id, to: "CANCELLED" as const, reason: "x" };
      expect(
        await codeOf(transition(tx, { ...cancel, actor: await actor(tx, "efda_officer") }))
      ).toBe("403 FORBIDDEN");
      expect(await codeOf(transition(tx, { ...cancel, actor: await actor(tx, "driver") }))).toBe(
        "403 FORBIDDEN"
      );
      const otherFacility = {
        ...(await actor(tx, "hospital_admin")),
        facilityId: "00000000-0000-7000-8000-000000000000",
      };
      expect(await codeOf(transition(tx, { ...cancel, actor: otherFacility }))).toBe(
        "403 FORBIDDEN"
      );
      expect(
        await codeOf(
          transition(tx, { ...cancel, reason: " ", actor: await actor(tx, "super_admin") })
        )
      ).toBe("422 REASON_REQUIRED");
      expect(
        await codeOf(
          transition(tx, {
            ...cancel,
            id: "00000000-0000-7000-8000-000000000001",
            actor: await actor(tx, "super_admin"),
          })
        )
      ).toBe("404 NOT_FOUND");
      expect(await status(tx, id)).toBe("REGISTERED");
      expect(await auditCount(tx, id)).toBe(0);
    }));

  it("guards run after the lock and can refuse the move", () =>
    inRolledBackDrizzle(async (tx) => {
      const id = await newWaste(tx);
      const seen: string[] = [];
      const refuse = transition(tx, {
        entity: "waste",
        id,
        to: "CANCELLED",
        reason: "x",
        actor: await actor(tx, "super_admin"),
        guards: [
          (ctx) => {
            seen.push(`${ctx.from}>${ctx.to}:${String(ctx.row.waste_code).slice(0, 3)}`);
          },
          () => ensure(false, "A container is already COLLECTED", "WASTE_ALREADY_COLLECTED"),
        ],
      });
      expect(await codeOf(refuse)).toBe("409 WASTE_ALREADY_COLLECTED");
      expect(seen).toEqual(["REGISTERED>CANCELLED:WR-"]);
      expect(await status(tx, id)).toBe("REGISTERED");
    }));

  it("a destroyed container is locked: every further move is refused", () =>
    inRolledBackDrizzle(async (tx) => {
      const wasteId = await newWaste(tx, "RECEIVED");
      const code = await one<{ waste_code: string }>(
        tx,
        sql`SELECT waste_code FROM waste_records WHERE id = ${wasteId}`
      );
      const c = await one<{ id: string }>(
        tx,
        sql`INSERT INTO containers (container_code, waste_record_id, seq_no, status)
            VALUES (${`${code.waste_code}-C01`}, ${wasteId}, 1, 'RECEIVED') RETURNING id`
      );
      const op = await actor(tx, "disposal_operator");
      await transition(tx, { entity: "container", id: c.id, to: "DESTROYED", actor: op });
      for (const to of ["RECEIVED", "MISSING", "LABELLED", "DESTROYED"] as const) {
        expect(
          await codeOf(
            transition(tx, { entity: "container", id: c.id, to, actor: op, reason: "x" })
          ),
          to
        ).toBe("409 INVALID_TRANSITION");
      }
    }));

  it("refuses unknown columns and a status inside `set` (programming errors)", () =>
    inRolledBackDrizzle(async (tx) => {
      const id = await newWaste(tx);
      const admin = await actor(tx, "super_admin");
      await expect(
        transition(tx, { entity: "waste", id, to: "SCHEDULED", actor: admin, set: { nope: 1 } })
      ).rejects.toThrow(/unknown column/);
      await expect(
        transition(tx, { entity: "waste", id, to: "SCHEDULED", actor: admin, set: { status: "X" } })
      ).rejects.toThrow(/`to`/);
    }));

  it("two concurrent requests for the same move: one wins, the other gets 409", async () => {
    const id = await inCommittedTransaction((tx) => newWaste(tx));
    cleanup.push(id);
    const results = await Promise.allSettled(
      ["super_admin", "hospital_staff"].map((role) =>
        inCommittedTransaction(async (tx) =>
          transition(tx, {
            entity: "waste",
            id,
            to: "CANCELLED",
            reason: `race ${role}`,
            actor: await actor(tx, role as Role),
          })
        )
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as AppError).code).toBe("INVALID_TRANSITION");
    const audits = await testPool().query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1`,
      [id]
    );
    expect(audits.rows[0].n).toBe(1);
  });
});
