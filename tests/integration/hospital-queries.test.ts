import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/server/auth/access-rules";
import { toEatDateString } from "@/lib/dates";
import { AppError } from "@/server/errors";
import * as q from "@/server/queries/hospital"; // vi.mock calls below are hoisted above this import
import { closeTestPool, testPool } from "./db";

/**
 * Gate 2.12: hospital queries against the seeded `dev` database. The signed-in user is a stub (the real one needs
 * a Next request) whose facility we choose; React's per-request `cache` is a pass-through outside Next.
 */
const current: { role: Role; facilityId: string | null } = {
  role: "hospital_admin",
  facilityId: null,
};
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(current.role)) throw new AppError("FORBIDDEN", 403);
    return { id: "test", role: current.role, facilityId: current.facilityId, active: true };
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const fac: Record<string, string> = {};
beforeAll(async () => {
  const { rows } = await testPool().query(`SELECT code, id FROM facilities`);
  for (const r of rows) fac[r.code] = r.id;
});
afterAll(closeTestPool);

function as(role: Role, facilityCode: string | null) {
  current.role = role;
  current.facilityId = facilityCode ? fac[facilityCode] : null;
}

const count = async (sql: string, params: unknown[]) =>
  Number((await testPool().query(sql, params)).rows[0].n);

describe("hospital queries: access (CLAUDE.md §3)", () => {
  it("non-hospital roles get 403 from every hospital query", async () => {
    for (const role of ["super_admin", "driver", "disposal_operator", "efda_officer"] as Role[]) {
      as(role, null);
      for (const call of [
        () => q.getHospitalFacility(),
        () => q.getHospitalKpis(),
        () => q.getHospitalWastePage(null),
        () => q.getHospitalCertificatesPage(null),
        () => q.getHospitalInvoicesPage(null),
        () => q.getHospitalOutstanding(),
      ]) {
        await expect(call(), role).rejects.toMatchObject({ httpStatus: 403 });
      }
    }
  });

  it("hospital_staff sees waste and certificates but never invoices", async () => {
    as("hospital_staff", "DD-GEN-002");
    await expect(q.getHospitalWastePage(null)).resolves.toBeTruthy();
    await expect(q.getHospitalInvoicesPage(null)).rejects.toMatchObject({ httpStatus: 403 });
    await expect(q.getHospitalOutstanding()).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe("hospital queries: own facility only (scope inside SQL)", () => {
  it("waste: exactly the facility's records, none of another facility's", async () => {
    as("hospital_admin", "DD-REF-001");
    const ref = await q.getHospitalWastePage(null, 100);
    expect(ref.rows.length).toBe(
      await count(`SELECT count(*) AS n FROM waste_records WHERE facility_id = $1`, [
        fac["DD-REF-001"],
      ])
    );
    as("hospital_staff", "DD-GEN-002");
    const gen = await q.getHospitalWastePage(null, 100);
    const refIds = new Set(ref.rows.map((r) => r.id));
    expect(gen.rows.some((r) => refIds.has(r.id))).toBe(false);
  });

  it("certificates: only for the facility's own waste", async () => {
    as("hospital_admin", "DD-REF-001");
    const page = await q.getHospitalCertificatesPage(null, 100);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((c) => c.facility.code === "DD-REF-001")).toBe(true);
  });

  it("KPIs equal independent counts for the facility", async () => {
    as("hospital_admin", "DD-REF-001");
    const k = await q.getHospitalKpis();
    const id = fac["DD-REF-001"];
    expect(k.waitingPickupCount).toBe(
      await count(
        `SELECT count(*) AS n FROM waste_records WHERE facility_id = $1 AND status = 'REGISTERED'`,
        [id]
      )
    );
    expect(k.scheduledCount).toBe(
      await count(
        `SELECT count(*) AS n FROM waste_records WHERE facility_id = $1 AND status = 'SCHEDULED'`,
        [id]
      )
    );
  });

  it("invoices: never drafts; overdue = ISSUED and past due; outstanding total adds up", async () => {
    as("hospital_admin", "DD-REF-001");
    const all = await q.getHospitalInvoicesPage(null, 100);
    expect(all.rows.length).toBeGreaterThan(0);
    expect(all.rows.some((i) => i.status === "DRAFT")).toBe(false);
    const today = toEatDateString(new Date()); // overdue is judged on the EAT calendar date
    for (const i of all.rows) {
      expect(i.overdue).toBe(i.status === "ISSUED" && !!i.dueDate && i.dueDate < today);
      expect(i.totalSantim).toBe((i.subtotalSantim ?? 0) + (i.vatSantim ?? 0));
    }
    const out = await q.getHospitalOutstanding();
    expect(out.rows.every((i) => i.status === "ISSUED")).toBe(true);
    expect(out.totalSantim).toBe(out.rows.reduce((n, i) => n + i.totalSantim, 0));
  });

  it("facility readiness: DD-CLI-017 has no OTP recipient, DD-REF-001 has at least one", async () => {
    as("hospital_staff", "DD-CLI-017");
    expect((await q.getHospitalFacility())?.otpRecipientCount).toBe(0);
    as("hospital_admin", "DD-REF-001");
    expect((await q.getHospitalFacility())?.otpRecipientCount).toBeGreaterThanOrEqual(1);
  });

  it("waste paging has no overlap; a malformed cursor is ignored", async () => {
    as("hospital_admin", "DD-REF-001");
    const p1 = await q.getHospitalWastePage(null, 2);
    const p2 = await q.getHospitalWastePage(p1.nextCursor, 2);
    expect(p1.nextCursor).toBe(p1.rows[1].wasteCode);
    expect(p2.rows.every((r) => r.wasteCode < p1.rows[1].wasteCode)).toBe(true);
    expect(q.parseHospitalCursor("WR-2610-00001")).toBe("WR-2610-00001");
    expect(q.parseHospitalCursor("x' OR '1'='1")).toBeNull();
  });
});
