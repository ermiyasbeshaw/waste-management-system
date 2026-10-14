import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import { auditLabelPrint, getContainerLabelsPdf, loadLabelSheet } from "@/server/services/labels";
import { registerWasteTx } from "@/server/services/waste";
import { closeTestPool, inRolledBackDrizzle, testPool } from "./db";

/**
 * Gate 2.16: container labels. Everything runs inside rolled-back transactions; the session user and the Amharic
 * setting are stubbed for the entry-point tests.
 */
let sessionRole: Role = "hospital_staff";
let amharic = false;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(sessionRole)) throw new AppError("FORBIDDEN", 403);
    return { id: "stub", role: sessionRole, facilityId: null, active: true };
  }),
}));
vi.mock("@/server/services/settings", async (original) => {
  const real = await original<typeof import("@/server/services/settings")>();
  return {
    getSetting: vi.fn(async (key: string, tx?: unknown) =>
      key === "label_amharic_enabled" ? amharic : real.getSetting(key as never, tx as never)
    ),
  };
});

const users: Record<string, ActiveUser> = {};
beforeAll(async () => {
  const { rows } = await testPool().query(
    `SELECT id, role, facility_id FROM users WHERE clerk_user_id LIKE 'dev_%'`
  );
  for (const r of rows)
    users[r.role] = { id: r.id, role: r.role, facilityId: r.facility_id, active: true };
});
afterAll(closeTestPool);

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

const input = { categoryCode: "INFECTIOUS", containerCount: 3, weightKg: 9 };

describe("labels: scope and status (Appendix C)", () => {
  it("own facility and super_admin get all containers; another facility gets 404; other roles 403", () =>
    inRolledBackDrizzle(async (tx) => {
      const w = await registerWasteTx(tx, users.hospital_staff, input); // DD-GEN-002
      const own = await loadLabelSheet(tx, users.hospital_staff, w.id);
      expect(own.input.labels.map((l) => l.containerCode)).toEqual(w.containerCodes);
      expect(own.input.labels.map((l) => `${l.seq}/${l.total}`)).toEqual(["1/3", "2/3", "3/3"]);
      expect(own.input.facilityName).toBe("Sabian General Hospital");

      expect((await loadLabelSheet(tx, users.super_admin, w.id)).input.labels).toHaveLength(3);
      // hospital_admin belongs to DD-REF-001: the record must not even be revealed.
      expect(await codeOf(loadLabelSheet(tx, users.hospital_admin, w.id))).toBe("404 NOT_FOUND");
      for (const role of ["efda_officer", "driver", "disposal_operator"]) {
        expect(await codeOf(loadLabelSheet(tx, users[role], w.id)), role).toBe("403 FORBIDDEN");
      }
      expect(await codeOf(loadLabelSheet(tx, users.super_admin, "not-a-uuid"))).toBe(
        "404 NOT_FOUND"
      );
    }));

  it("cancelled waste → labels invalid (409); collected waste → no labels (409)", () =>
    inRolledBackDrizzle(async (tx) => {
      const w = await registerWasteTx(tx, users.hospital_staff, input);
      await tx.execute(
        sql`UPDATE waste_records SET status = 'CANCELLED', cancel_reason = 'test', cancelled_at = now() WHERE id = ${w.id}`
      );
      expect(await codeOf(loadLabelSheet(tx, users.hospital_staff, w.id))).toBe(
        "409 LABELS_INVALID"
      );
      await tx.execute(
        sql`UPDATE waste_records SET status = 'IN_TRANSIT', cancel_reason = NULL, cancelled_at = NULL WHERE id = ${w.id}`
      );
      expect(await codeOf(loadLabelSheet(tx, users.hospital_staff, w.id))).toBe(
        "409 LABELS_NOT_NEEDED"
      );
    }));
});

describe("labels: every print is audited, codes never change", () => {
  it("first print → labels.printed, later prints → labels.reprinted with the same codes", () =>
    inRolledBackDrizzle(async (tx) => {
      const w = await registerWasteTx(tx, users.hospital_staff, input);
      const first = await loadLabelSheet(tx, users.hospital_staff, w.id);
      expect(await auditLabelPrint(tx, users.hospital_staff, first, "req-1")).toBe(
        "labels.printed"
      );
      const second = await loadLabelSheet(tx, users.hospital_staff, w.id);
      expect(await auditLabelPrint(tx, users.hospital_staff, second)).toBe("labels.reprinted");
      expect(second.input.labels).toEqual(first.input.labels);

      const rows = (
        await tx.execute(
          sql`SELECT action, after FROM audit_logs WHERE entity_id = ${w.id} AND action LIKE 'labels.%' ORDER BY seq`
        )
      ).rows as { action: string; after: { printNumber: number } }[];
      expect(rows.map((r) => [r.action, r.after.printNumber])).toEqual([
        ["labels.printed", 1],
        ["labels.reprinted", 2],
      ]);
    }));
});

describe("labels: entry point", () => {
  it("the EFDA officer gets 403 before anything is read", async () => {
    sessionRole = "efda_officer";
    expect(await codeOf(getContainerLabelsPdf("00000000-0000-7000-8000-000000000001"))).toBe(
      "403 FORBIDDEN"
    );
    sessionRole = "hospital_staff";
  });

  it("Amharic switched on but not configured → 501, not a silently English label", async () => {
    amharic = true;
    expect(await codeOf(getContainerLabelsPdf("00000000-0000-7000-8000-000000000001"))).toBe(
      "501 LABELS_AMHARIC_NOT_CONFIGURED"
    );
    amharic = false;
  });
});
