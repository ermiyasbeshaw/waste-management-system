import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import type { DbExecutor } from "@/server/db/executor";
import { AppError } from "@/server/errors";
import { withIdempotency } from "@/server/idempotency/store";
import { REGISTER_WASTE_ROUTE, registerWaste, registerWasteTx } from "@/server/services/waste";
import { closeTestPool, inRolledBackDrizzle, testPool } from "./db";

/**
 * Gate 2.15: waste registration. The transaction body runs inside a rolled-back transaction, so nothing is left
 * in the database. The role check of the entry point is tested with a stubbed session user.
 */
let sessionRole: Role = "hospital_staff";
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(sessionRole)) throw new AppError("FORBIDDEN", 403);
    throw new Error("the entry point must not reach the database in this test");
  }),
}));

const users: Record<string, ActiveUser> = {};
beforeAll(async () => {
  const { rows } = await testPool().query(
    `SELECT clerk_user_id, id, role, facility_id FROM users WHERE clerk_user_id LIKE 'dev_%'`
  );
  for (const r of rows) {
    users[r.role] = { id: r.id, role: r.role, facilityId: r.facility_id, active: true };
  }
});
afterAll(closeTestPool);

const input = { categoryCode: "SHARPS", containerCount: 3, weightKg: 7.5 };

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

const one = async <T>(tx: DbExecutor, q: ReturnType<typeof sql>) =>
  (await tx.execute(q)).rows[0] as T;

describe("registerWaste: access (CLAUDE.md §3)", () => {
  it("only hospital roles may register; efda_officer and every other role get 403 before any write", async () => {
    for (const role of ["super_admin", "driver", "disposal_operator", "efda_officer"] as Role[]) {
      sessionRole = role;
      expect(await codeOf(registerWaste(input, { idempotencyKey: randomUUID() })), role).toBe(
        "403 FORBIDDEN"
      );
    }
  });

  it("the transaction body refuses non-hospital users too (defence in depth)", () =>
    inRolledBackDrizzle(async (tx) => {
      expect(await codeOf(registerWasteTx(tx, users.efda_officer, input))).toBe("403 FORBIDDEN");
      expect(await codeOf(registerWasteTx(tx, users.disposal_operator, input))).toBe(
        "403 FORBIDDEN"
      );
    }));
});

describe("registerWaste: one transaction (waste + containers + audit)", () => {
  it("creates the waste REGISTERED at the user's OWN facility with every container LABELLED", () =>
    inRolledBackDrizzle(async (tx) => {
      const staff = users.hospital_staff;
      const r = await registerWasteTx(tx, staff, { ...input, facilityId: "ignored" }, "req-test");
      expect(r.wasteCode).toMatch(/^WR-\d{4}-\d{5}$/);
      expect(r.containerCodes).toEqual([1, 2, 3].map((i) => `${r.wasteCode}-C0${i}`));

      const w = await one<{
        status: string;
        facility_id: string;
        weight_kg: string;
        registered_by: string;
      }>(
        tx,
        sql`SELECT status, facility_id, weight_kg, registered_by FROM waste_records WHERE id = ${r.id}`
      );
      expect(w).toEqual({
        status: "REGISTERED",
        facility_id: staff.facilityId,
        weight_kg: "7.50",
        registered_by: staff.id,
      });
      const c = await one<{ n: number; labelled: number }>(
        tx,
        sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'LABELLED')::int AS labelled
            FROM containers WHERE waste_record_id = ${r.id}`
      );
      expect(c).toEqual({ n: 3, labelled: 3 });

      const a = await one<{
        action: string;
        role: string;
        request_id: string;
        after: Record<string, unknown>;
      }>(tx, sql`SELECT action, role, request_id, after FROM audit_logs WHERE entity_id = ${r.id}`);
      expect(a).toMatchObject({
        action: "waste.registered",
        role: "hospital_staff",
        request_id: "req-test",
        after: { wasteCode: r.wasteCode, status: "REGISTERED", containerCount: 3 },
      });
    }));

  it("invalid input → 422 with field errors, nothing written", () =>
    inRolledBackDrizzle(async (tx) => {
      const before = await one<{ n: number }>(
        tx,
        sql`SELECT count(*)::int AS n FROM waste_records`
      );
      const err = await registerWasteTx(tx, users.hospital_admin, {
        categoryCode: "",
        containerCount: 0,
        weightKg: 0,
      }).catch((e: unknown) => e as AppError);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).httpStatus).toBe(422);
      expect(Object.keys((err as AppError).details.fields as object).sort()).toEqual([
        "categoryCode",
        "containerCount",
        "weightKg",
      ]);
      expect(
        await one<{ n: number }>(tx, sql`SELECT count(*)::int AS n FROM waste_records`)
      ).toEqual(before);
    }));

  it("an unknown or inactive category is refused with a field error", () =>
    inRolledBackDrizzle(async (tx) => {
      expect(
        await codeOf(registerWasteTx(tx, users.hospital_admin, { ...input, categoryCode: "NOPE" }))
      ).toBe("422 VALIDATION_ERROR");
      await tx.execute(sql`UPDATE waste_categories SET active = false WHERE code = 'SHARPS'`);
      expect(await codeOf(registerWasteTx(tx, users.hospital_admin, input))).toBe(
        "422 VALIDATION_ERROR"
      );
    }));

  it("a suspended facility cannot register waste", () =>
    inRolledBackDrizzle(async (tx) => {
      await tx.execute(
        sql`UPDATE facilities SET status = 'SUSPENDED' WHERE id = ${users.hospital_admin.facilityId}`
      );
      expect(await codeOf(registerWasteTx(tx, users.hospital_admin, input))).toBe(
        "409 FACILITY_NOT_ACTIVE"
      );
    }));

  it("a double submit with the same idempotency key registers once and returns the same Waste ID", () =>
    inRolledBackDrizzle(async (tx) => {
      const key = randomUUID();
      const staff = users.hospital_staff;
      const submit = () =>
        withIdempotency(
          tx,
          { key, userId: staff.id, route: REGISTER_WASTE_ROUTE, request: input },
          async () => ({
            status: 201,
            body: await registerWasteTx(tx, staff, input),
          })
        );
      const first = await submit();
      const second = await submit();
      expect(second.replayed).toBe(true);
      expect(second.body.wasteCode).toBe(first.body.wasteCode);
      const n = await one<{ n: number }>(
        tx,
        sql`SELECT count(*)::int AS n FROM waste_records WHERE waste_code = ${first.body.wasteCode}`
      );
      expect(n.n).toBe(1);
    }));
});
