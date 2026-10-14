import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import { getDisposalDashboard } from "@/server/queries/disposal"; // vi.mock calls below are hoisted
import { getDriverDashboard } from "@/server/queries/driver";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 2.14: driver and disposal consoles against the seeded `dev` database (scenario in
 * scripts/seed-operations.ts). The signed-in user is a stub; React's `cache` is a pass-through outside Next.
 */
const current: { id: string; role: Role; facilityId: string | null } = {
  id: "",
  role: "driver",
  facilityId: null,
};
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!roles.includes(current.role)) throw new AppError("FORBIDDEN", 403);
    return { ...current, active: true, fullName: "stub" };
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const users: Record<string, { id: string; facility_id: string | null }> = {};
let hospitalId = "";
beforeAll(async () => {
  const { rows } = await testPool().query(
    `SELECT clerk_user_id, id, facility_id FROM users WHERE clerk_user_id IN ('dev_driver', 'seed_driver_2', 'dev_disposal_operator', 'dev_super_admin')`
  );
  for (const r of rows) users[r.clerk_user_id] = r;
  hospitalId = (await testPool().query(`SELECT id FROM facilities WHERE code = 'DD-REF-001'`))
    .rows[0].id;
});
afterAll(closeTestPool);

function as(clerkId: string, role: Role, facilityId?: string | null) {
  current.id = users[clerkId]?.id ?? "00000000-0000-7000-8000-000000000099";
  current.role = role;
  current.facilityId =
    facilityId === undefined ? (users[clerkId]?.facility_id ?? null) : facilityId;
}

const n = async (sql: string) => Number((await testPool().query(sql)).rows[0].n);

describe("driver console (own trips only)", () => {
  it("other roles get 403", async () => {
    for (const role of [
      "super_admin",
      "hospital_admin",
      "disposal_operator",
      "efda_officer",
    ] as Role[]) {
      as("dev_super_admin", role, null);
      await expect(getDriverDashboard(), role).rejects.toMatchObject({ httpStatus: 403 });
    }
  });

  it("the dev driver sees its own trip in progress with the stops in order, and no other driver's trips", async () => {
    as("dev_driver", "driver");
    const d = await getDriverDashboard();
    expect(d?.driver.licenseNo).toBe("ETH-DD-DRV-9018");
    // Expectations come from the database: the test branch's seeded trip may have moved on since the seed.
    const own = `SELECT t.id FROM trips t JOIN drivers dr ON dr.id = t.driver_id JOIN users u ON u.id = dr.user_id
                 WHERE u.clerk_user_id = 'dev_driver'`;
    const live = (await testPool().query(`${own} AND t.status = 'IN_PROGRESS'`)).rows;
    expect(live.length).toBeLessThanOrEqual(1);
    if (live.length === 0) {
      expect(d!.activeTrip).toBeNull();
    } else {
      const trip = d!.activeTrip!;
      expect(trip.id).toBe(live[0].id);
      expect(trip.vehiclePlate).toBe("ET-3-A48291");
      const stops = (
        await testPool().query(
          `SELECT status, collection_method,
                  (SELECT coalesce(sum(w.container_count), 0)::int FROM trip_stop_waste l
                     JOIN waste_records w ON w.id = l.waste_record_id
                     WHERE l.trip_stop_id = s.id AND l.active) AS expected
           FROM trip_stops s WHERE trip_id = $1 ORDER BY priority_order`,
          [trip.id]
        )
      ).rows;
      expect(trip.stopsTotal).toBe(stops.length);
      expect(trip.stops.map((s) => s.status)).toEqual(stops.map((s) => s.status));
      expect(trip.stops.map((s) => s.collectionMethod)).toEqual(
        stops.map((s) => s.collection_method)
      );
      expect(trip.stops.map((s) => s.expectedContainers)).toEqual(stops.map((s) => s.expected));
      for (const s of trip.stops.filter((x) => x.status === "ARRIVED")) {
        expect(s.arrivedAt).not.toBeNull();
        expect(s.categories.map((c) => c.count).reduce((a, b) => a + b, 0)).toBe(
          s.expectedContainers
        );
      }
    }
    const planned = await n(`SELECT count(*) n FROM (${own} AND t.status = 'PLANNED') x`);
    expect(d!.upcomingTrips).toHaveLength(planned); // only its own; tomorrow's trip belongs to the second driver
  });

  it("the second driver sees only tomorrow's planned trip", async () => {
    as("seed_driver_2", "driver");
    const d = await getDriverDashboard();
    expect(d!.activeTrip).toBeNull();
    expect(d!.upcomingTrips).toHaveLength(1);
    expect(d!.upcomingTrips[0]).toMatchObject({
      status: "PLANNED",
      vehiclePlate: "ET-3-B91024",
      stopsTotal: 2,
    });
  });

  it("a driver-role user without a driver profile gets null (not someone else's data)", async () => {
    as("nobody", "driver", null);
    expect(await getDriverDashboard()).toBeNull();
  });
});

describe("disposal console (operator of the disposal site)", () => {
  it("other roles get 403; an operator not linked to the DISPOSAL_SITE gets 403", async () => {
    as("dev_super_admin", "super_admin", null);
    await expect(getDisposalDashboard()).rejects.toMatchObject({ httpStatus: 403 });
    as("dev_disposal_operator", "disposal_operator", null);
    await expect(getDisposalDashboard()).rejects.toMatchObject({ httpStatus: 403 });
    as("dev_disposal_operator", "disposal_operator", hospitalId);
    await expect(getDisposalDashboard()).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("queue, inbound and exceptions match the database", async () => {
    as("dev_disposal_operator", "disposal_operator");
    const d = await getDisposalDashboard();
    expect(d.siteName).toMatch(/Disposal Site/);
    expect(d.stats.queueCount).toBe(
      await n(`SELECT count(*) n FROM containers WHERE status = 'RECEIVED'`)
    );
    expect(
      d.queue.every((c) => c.status === "RECEIVED" && /^WR-\d{4}-\d{5}$/.test(c.wasteCode))
    ).toBe(true);
    expect(d.queue.every((c) => c.containerCode.startsWith(`${c.wasteCode}-C`))).toBe(true);
    const inProgress = await n(`SELECT count(*) n FROM trips WHERE status = 'IN_PROGRESS'`);
    expect(d.stats.inboundCount).toBe(inProgress);
    expect(d.inbound).toHaveLength(Math.min(inProgress, 20)); // LIMIT 20
    expect(d.inbound.every((t) => t.status === "IN_PROGRESS")).toBe(true);
    expect(d.exceptions.every((c) => c.status === "MISSING" || c.status === "REFUSED")).toBe(true);
    expect(d.exceptions.every((c) => !!c.reason)).toBe(true);
    expect(d.stats.exceptionsCount).toBe(d.stats.missingCount + d.stats.refusedCount);
    expect(d.stats.exceptionsCount).toBe(d.exceptions.length);
  });
});
