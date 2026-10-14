import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import * as q from "@/server/queries/regulator"; // vi.mock calls below are hoisted above this import
import { closeTestPool, testPool } from "./db";

/**
 * Gate 2.11: the regulator queries against the seeded `dev` database. The signed-in user is replaced by a stub
 * (the real one needs a Next request); React's per-request `cache` is a pass-through outside Next.
 */
let currentRole: Role = "efda_officer";
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(currentRole)) throw new AppError("FORBIDDEN", 403);
    return { id: "test", role: currentRole, facilityId: null, active: true };
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

beforeEach(() => {
  currentRole = "efda_officer";
});
afterAll(closeTestPool);

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows[0] as T;

describe("regulator queries: access (CLAUDE.md §3)", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["filter options", () => q.getRegulatorFilterOptions()],
    ["kpis", () => q.getRegulatorKpis("ALL", "ALL")],
    ["weekly", () => q.getRegulatorWeekly("ALL", "ALL")],
    ["facility volumes", () => q.getRegulatorFacilityVolumes("ALL", "ALL")],
    ["audit", () => q.getRegulatorAuditPage(null)],
    ["certificates", () => q.getRegulatorCertificatesPage("ALL", "ALL", null)],
    ["map", () => q.getRegulatorMap()],
  ];
  for (const role of [
    "super_admin",
    "hospital_admin",
    "hospital_staff",
    "driver",
    "disposal_operator",
  ] as Role[]) {
    it(`${role} gets 403 from every regulator query`, async () => {
      currentRole = role;
      for (const [name, call] of calls) {
        await expect(call(), name).rejects.toMatchObject({ httpStatus: 403 });
      }
    });
  }
});

/** Health facilities (everything except the disposal site); test fixtures on the test branch add their own. */
const healthFacilities = async () =>
  Number(
    (await one<{ n: string }>(`SELECT count(*) n FROM facilities WHERE type <> 'DISPOSAL_SITE'`)).n
  );

describe("regulator queries: data (seeded database)", () => {
  it("filter options list every health facility and the active categories", async () => {
    const o = await q.getRegulatorFilterOptions();
    expect(o.facilities).toHaveLength(await healthFacilities());
    expect(o.facilities.some((f) => f.code === "DD-DIS-018")).toBe(false);
    expect(o.categories.map((c) => c.code)).toContain("INFECTIOUS");
    expect(o.categories.every((c) => /^#[0-9a-f]{6}$/i.test(c.colourHex))).toBe(true);
  });

  it("KPIs equal an independent count, and filters narrow them", async () => {
    const all = await q.getRegulatorKpis("ALL", "ALL");
    const expected = await one<{
      kg: string;
      containers: string;
      issued: string;
      revoked: string;
    }>(`
      SELECT (SELECT sum(weight_kg) FROM waste_records WHERE status <> 'CANCELLED') AS kg,
             (SELECT sum(container_count) FROM waste_records WHERE status <> 'CANCELLED') AS containers,
             (SELECT count(*) FROM certificates WHERE status = 'ISSUED') AS issued,
             (SELECT count(*) FROM certificates WHERE status = 'REVOKED') AS revoked`);
    expect(all.totalContainers).toBe(Number(expected.containers));
    expect(all.totalKg).toBeCloseTo(Number(expected.kg), 1);
    expect(all.certificatesIssuedCount).toBe(Number(expected.issued));
    expect(all.certificatesRevokedCount).toBe(Number(expected.revoked));
    expect(all.facilitiesCount).toBe(
      Number(
        (
          await one<{ n: string }>(
            `SELECT count(*) n FROM facilities WHERE type <> 'DISPOSAL_SITE' AND status = 'ACTIVE'`
          )
        ).n
      )
    );

    const ref = await q.getRegulatorKpis("DD-REF-001", "ALL");
    expect(ref.facilitiesCount).toBe(1);
    expect(ref.totalContainers).toBeGreaterThan(0);
    expect(ref.totalContainers).toBeLessThan(all.totalContainers);
    const refSharps = await q.getRegulatorKpis("DD-REF-001", "SHARPS");
    expect(refSharps.totalContainers).toBeLessThan(ref.totalContainers);
    const nothing = await q.getRegulatorKpis("XX-NON-999", "ALL");
    expect(nothing).toMatchObject({ totalKg: 0, totalContainers: 0, facilitiesCount: 0 });
  });

  it("weekly trend: 8 weeks, oldest first, labelled, never more than the total", async () => {
    const weeks = await q.getRegulatorWeekly("ALL", "ALL");
    expect(weeks).toHaveLength(8);
    expect(weeks[0].weekLabel).toMatch(/^W\d{2} \([A-Z][a-z]{2} \d{2}\)$/);
    const total = await q.getRegulatorKpis("ALL", "ALL");
    const sum = weeks.reduce((n, w) => n + w.containers, 0);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThanOrEqual(total.totalContainers);
  });

  it("facility volumes: one row per health facility, largest first; facility filter gives one row", async () => {
    const rows = await q.getRegulatorFacilityVolumes("ALL", "ALL");
    expect(rows).toHaveLength(Math.min(await healthFacilities(), 100)); // LIMIT 100
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].kg).toBeGreaterThanOrEqual(rows[i].kg);
    expect(await q.getRegulatorFacilityVolumes("DD-GEN-002", "ALL")).toHaveLength(1);
  });

  it("audit ledger pages backwards by seq without gaps or overlaps", async () => {
    const p1 = await q.getRegulatorAuditPage(null, 20);
    expect(p1.rows).toHaveLength(20);
    expect(p1.nextCursor).toBe(String(p1.rows[19].seq));
    const p2 = await q.getRegulatorAuditPage(p1.nextCursor, 20);
    expect(p2.rows[0].seq).toBeLessThan(p1.rows[19].seq);
    const seqs = [...p1.rows, ...p2.rows].map((r) => r.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(p1.rows.some((r) => r.summary.length > 0)).toBe(true);
    // A malformed cursor is ignored (first page), never injected.
    const bad = await q.getRegulatorAuditPage("1; DROP TABLE x", 5);
    expect(bad.rows[0].seq).toBe(p1.rows[0].seq);
  });

  it("certificates page by number and respect the facility filter", async () => {
    const p1 = await q.getRegulatorCertificatesPage("ALL", "ALL", null, 5);
    expect(p1.rows).toHaveLength(5);
    const p2 = await q.getRegulatorCertificatesPage("ALL", "ALL", p1.nextCursor, 5);
    const nos = [...p1.rows, ...p2.rows].map((r) => r.certificateNo);
    expect(new Set(nos).size).toBe(nos.length);
    expect(nos).toEqual([...nos].sort().reverse());
    const ref = await q.getRegulatorCertificatesPage("DD-REF-001", "ALL", null, 100);
    expect(ref.rows.length).toBeGreaterThan(0);
    expect(ref.rows.every((r) => r.facility.code === "DD-REF-001")).toBe(true);
    const issued = p1.rows.concat(p2.rows).filter((r) => r.status === "ISSUED");
    expect(issued.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.issuedOn ?? ""))).toBe(true);
  });

  it("map shows only trips in progress; no GPS point yet → speed null", async () => {
    const map = await q.getRegulatorMap();
    const live = await testPool().query(
      `SELECT v.plate_no, (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id)::int AS stops
       FROM trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.status = 'IN_PROGRESS'`
    );
    const plates = live.rows.map((r) => r.plate_no as string);
    expect(map.vehicles).toHaveLength(Math.min(plates.length, 10)); // LIMIT 10
    expect(map.vehicles.every((v) => plates.includes(v.plateNumber))).toBe(true);
    // Speed comes from the latest GPS point of the trip (null = no point yet).
    expect(map.vehicles.every((v) => v.speedKmh === null || v.speedKmh >= 0)).toBe(true);
    const stops = live.rows.reduce((n, r) => n + (r.stops as number), 0);
    expect(map.stops).toHaveLength(Math.min(stops, 50)); // LIMIT 50
  });

  it("URL filters accept only codes", () => {
    expect(q.parseRegulatorFilters({ facility: "DD-REF-001", category: "SHARPS" })).toEqual({
      facilityCode: "DD-REF-001",
      categoryCode: "SHARPS",
    });
    expect(q.parseRegulatorFilters({ facility: "x' OR 1=1 --", category: ["a", "b"] })).toEqual({
      facilityCode: "ALL",
      categoryCode: "ALL",
    });
  });
});
