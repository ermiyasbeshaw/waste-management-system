import { afterAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import * as q from "@/server/queries/admin"; // vi.mock calls below are hoisted above this import
import { closeTestPool, testPool } from "./db";

/**
 * Gate 2.13: Super Administrator queries against the seeded `dev` database (see scripts/seed-operations.ts for
 * the scenario). The signed-in user is a stub; React's per-request `cache` is a pass-through outside Next.
 */
let currentRole: Role = "super_admin";
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

afterAll(closeTestPool);

const n = async (sql: string) => Number((await testPool().query(sql)).rows[0].n);
/** Codes of the seeded facilities (DD-…); committed test fixtures use other prefixes. */
const seeded = (codes: string[]) => codes.filter((c) => c.startsWith("DD-"));
/** Plates of seeded vehicles (ET-…) on a trip in progress. */
const seededLiveVehicles = async () =>
  (
    await testPool().query(
      `SELECT DISTINCT v.plate_no FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
       WHERE t.status = 'IN_PROGRESS' AND v.plate_no LIKE 'ET-%' ORDER BY 1`
    )
  ).rows.map((r) => r.plate_no as string);

describe("admin queries: access (CLAUDE.md §3)", () => {
  it("every other role gets 403 from every admin query", async () => {
    for (const role of [
      "hospital_admin",
      "hospital_staff",
      "driver",
      "disposal_operator",
      "efda_officer",
    ] as Role[]) {
      currentRole = role;
      for (const call of [
        () => q.getAdminKpis(),
        () => q.getAdminTripsToday(),
        () => q.getAdminMap(),
        () => q.getAdminCategoryVolume(),
        () => q.getAdminInvoicesPage(null),
        () => q.getAdminContracts(),
        () => q.getAdminAlerts(),
      ]) {
        await expect(call(), role).rejects.toMatchObject({ httpStatus: 403 });
      }
    }
    currentRole = "super_admin";
  });
});

describe("admin queries: data (seeded database)", () => {
  it("KPIs equal independent counts; the overdue threshold comes from settings", async () => {
    currentRole = "super_admin";
    const k = await q.getAdminKpis();
    expect(k.awaitingPickupCount).toBe(
      await n(`SELECT count(*) n FROM waste_records WHERE status = 'REGISTERED'`)
    );
    expect(k.inTransitCount).toBe(
      await n(`SELECT count(*) n FROM waste_records WHERE status = 'IN_TRANSIT'`)
    );
    expect(k.awaitingDestructionCount).toBe(
      await n(`SELECT count(*) n FROM containers WHERE status = 'RECEIVED'`)
    );
    expect(k.outstandingCount).toBe(
      await n(`SELECT count(*) n FROM invoices WHERE status = 'ISSUED'`)
    );
    expect(k.draftCount).toBe(await n(`SELECT count(*) n FROM invoices WHERE status = 'DRAFT'`));
    expect(k.overduePickupDays).toBe(
      await n(`SELECT (value #>> '{}')::int n FROM settings WHERE key = 'overdue_pickup_days'`)
    );
    expect(k.tripsInProgressCount).toBe(
      await n(`SELECT count(*) n FROM trips WHERE status = 'IN_PROGRESS'`)
    );
    expect(k.overduePickupsCount).toBeGreaterThanOrEqual(2);
  });

  it("today's trips include every trip in progress, with stop and container totals from the database", async () => {
    const trips = await q.getAdminTripsToday();
    const live = trips.filter((t) => t.status === "IN_PROGRESS");
    const inProgress = await n(`SELECT count(*) n FROM trips WHERE status = 'IN_PROGRESS'`);
    if (trips.length < 50) expect(live).toHaveLength(inProgress);
    else expect(live.length).toBeLessThanOrEqual(inProgress); // LIMIT 50 reached
    for (const t of trips) {
      const id = `'${t.id}'::uuid`;
      expect(t.stopsTotal, t.tripCode).toBe(
        await n(`SELECT count(*) n FROM trip_stops WHERE trip_id = ${id}`)
      );
      expect(t.stopsCompleted, t.tripCode).toBe(
        await n(`SELECT count(*) n FROM trip_stops WHERE trip_id = ${id}
                 AND status IN ('COLLECTED', 'COLLECTED_OVERRIDE', 'SKIPPED')`)
      );
      expect(t.containersTotal, t.tripCode).toBe(
        await n(`SELECT coalesce(sum(w.container_count), 0) n FROM trip_stops s
                 JOIN trip_stop_waste l ON l.trip_stop_id = s.id AND l.active
                 JOIN waste_records w ON w.id = l.waste_record_id WHERE s.trip_id = ${id}`)
      );
    }
  });

  it("category volume covers every active category (30 days)", async () => {
    const cats = await q.getAdminCategoryVolume();
    expect(cats).toHaveLength(await n(`SELECT count(*) n FROM waste_categories WHERE active`));
    expect(cats.some((c) => c.kg > 0)).toBe(true);
  });

  it("invoices include drafts (admin view) and page without overlap", async () => {
    const p1 = await q.getAdminInvoicesPage(null, 10);
    const p2 = await q.getAdminInvoicesPage(p1.nextCursor, 10);
    const all = [...p1.rows, ...p2.rows].map((i) => i.invoiceNo);
    expect(new Set(all).size).toBe(all.length);
    const full = await q.getAdminInvoicesPage(null, 100);
    expect(full.rows.some((i) => i.status === "DRAFT")).toBe(true);
  });

  it("contracts: every contract, days until expiry, DD-CLI-009 has none", async () => {
    const { contracts, uncontractedFacilities } = await q.getAdminContracts();
    expect(contracts).toHaveLength(await n(`SELECT count(*) n FROM contracts`));
    for (const c of contracts.filter((x) => x.status === "EXPIRING_SOON")) {
      expect(c.daysUntilExpiry).toBeGreaterThan(0);
      expect(c.daysUntilExpiry).toBeLessThanOrEqual(30);
    }
    // Seeded facilities only: committed test fixtures on the test branch add their own uncontracted facilities.
    expect(seeded(uncontractedFacilities.map((f) => f.code))).toEqual(["DD-CLI-009"]);
  });

  it("alerts match the seeded scenario (CLAUDE.md §6)", async () => {
    const a = await q.getAdminAlerts();
    // The list shows at most 100 facilities (by name); test fixtures add many not-ready facilities, so the full
    // seeded pair is only certain while the list is not full.
    const notReady = seeded(a.facilitiesNotReady.map((f) => f.code)).sort();
    if (a.facilitiesNotReady.length < 100) expect(notReady).toEqual(["DD-CLI-009", "DD-CLI-017"]);
    else expect(["DD-CLI-009", "DD-CLI-017"]).toEqual(expect.arrayContaining(notReady));
    const overdueFacilities = a.overduePickups.map((w) => w.facilityName);
    expect(overdueFacilities).toContain("Melka Jebdu Poly Clinic"); // skipped stop, back on the waiting list
    expect(overdueFacilities).toContain("Kora Family Health Clinic"); // not ready AND waiting
    // Older than 7 days (overdue_pickup_days): 7.x days shows as 7 whole days.
    expect(a.overduePickups.every((w) => w.daysWaiting >= 7)).toBe(true);
    expect(a.overrides.length).toBeGreaterThanOrEqual(1);
    // Seeded vehicles only (test fixtures use other plates); the list shows at most 10 (LIMIT), so the check
    // applies when it is not full.
    if (a.silentTrackers.length < 10) {
      expect(a.silentTrackers.map((s) => s.plateNumber).filter((p) => p.startsWith("ET-"))).toEqual(
        await seededLiveVehicles()
      );
    }
    expect(a.overdueInvoices.length).toBeGreaterThan(0);
    expect(a.expiringLicences.map((l) => l.subject)).toContain("ET-3-B91024");
    expect(a.vehiclesWithoutTracker.filter((v) => v.plateNumber.startsWith("ET-"))).toEqual([]);
    expect(seeded(a.uncontractedFacilities.map((f) => f.code))).toEqual(["DD-CLI-009"]);
  });
});
