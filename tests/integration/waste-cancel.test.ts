import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import { cancelWaste } from "@/server/services/waste"; // vi.mock below is hoisted
import { closeTestPool, testPool } from "./db";

/** Waste cancellation (CLAUDE.md §5): reason, own facility, never while the truck is at the door. Commits on `test`. */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

let efda: ActiveUser;
let otherHospital: ActiveUser;
beforeAll(async () => {
  const users = await q<{
    clerk_user_id: string;
    id: string;
    role: Role;
    facility_id: string | null;
  }>(
    `SELECT clerk_user_id, id, role, facility_id FROM users WHERE clerk_user_id IN ('dev_efda_officer', 'dev_hospital_admin')`
  );
  const by = (k: string) => {
    const u = users.find((x) => x.clerk_user_id === k)!;
    return { id: u.id, role: u.role, facilityId: u.facility_id, active: true };
  };
  efda = by("dev_efda_officer");
  otherHospital = by("dev_hospital_admin");
});
afterAll(closeTestPool);

/** A clinic with a staff user and `n` waste records; optionally on one stop of a trip (stop status given). */
async function world(n: number, stop?: "PENDING" | "ARRIVED") {
  const code = `WC-${letters()}-${digits(3)}`;
  const [f] = await q<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'Test road', 9.6, 41.85) RETURNING id`,
    [code, `Cancel Test Clinic ${code}`]
  );
  const t = `${Date.now()}${digits(3)}`;
  const [u] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_staff', $2, 'Cancel Test Staff', $3) RETURNING id`,
    [`test_wc_${t}`, f.id, `wc${t}@example.test`]
  );
  const [cat] = await q<{ id: string }>(`SELECT id FROM waste_categories WHERE code = 'SHARPS'`);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const wc = `WR-99${digits(2)}-${digits(5)}`;
    const [w] = await q<{ id: string }>(
      `INSERT INTO waste_records (waste_code, facility_id, category_id, container_count, weight_kg, registered_by, status)
       VALUES ($1, $2, $3, 1, 3, $4, $5::waste_status) RETURNING id`,
      [wc, f.id, cat.id, u.id, stop ? "SCHEDULED" : "REGISTERED"]
    );
    await q(`INSERT INTO containers (container_code, waste_record_id, seq_no) VALUES ($1, $2, 1)`, [
      `${wc}-C01`,
      w.id,
    ]);
    ids.push(w.id);
  }
  let stopId: string | null = null;
  if (stop) {
    const [du] = await q<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, full_name, email) VALUES ($1, 'driver', 'Cancel Test Driver', $2) RETURNING id`,
      [`test_wcd_${t}`, `wcd${t}@example.test`]
    );
    const [d] = await q<{ id: string }>(
      `INSERT INTO drivers (user_id, license_no, status) VALUES ($1, $2, $3::driver_status) RETURNING id`,
      [du.id, `WC-${t}`, stop === "ARRIVED" ? "ON_TRIP" : "ON_DUTY"]
    );
    const [v] = await q<{ id: string }>(
      `INSERT INTO vehicles (plate_no, capacity_kg, status) VALUES ($1, 2000, $2::vehicle_status) RETURNING id`,
      [`WC-${digits(7)}`, stop === "ARRIVED" ? "IN_TRANSIT" : "ACTIVE"]
    );
    const [trip] = await q<{ id: string }>(
      `INSERT INTO trips (trip_code, vehicle_id, driver_id, planned_date, status, started_at)
       VALUES ($1, $2, $3, current_date, $4::trip_status, CASE WHEN $5::boolean THEN now() END) RETURNING id`,
      [
        `TR-99${digits(4)}-${digits(2)}`,
        v.id,
        d.id,
        stop === "ARRIVED" ? "IN_PROGRESS" : "PLANNED",
        stop === "ARRIVED",
      ]
    );
    [{ id: stopId }] = await q<{ id: string }>(
      `INSERT INTO trip_stops (trip_id, facility_id, priority_order, status, arrived_at)
       VALUES ($1, $2, 1, $3::stop_status, CASE WHEN $4::boolean THEN now() END) RETURNING id`,
      [trip.id, f.id, stop, stop === "ARRIVED"]
    );
    for (const id of ids) {
      await q(`INSERT INTO trip_stop_waste (trip_stop_id, waste_record_id) VALUES ($1, $2)`, [
        stopId,
        id,
      ]);
    }
  }
  const staff: ActiveUser = { id: u.id, role: "hospital_staff", facilityId: f.id, active: true };
  return { ids, staff, stopId };
}

const statusOf = async (id: string) =>
  (
    await q<{ status: string; cancel_reason: string | null }>(
      `SELECT status, cancel_reason FROM waste_records WHERE id = $1`,
      [id]
    )
  )[0];

describe("cancel waste", () => {
  it("own facility with a reason; others 404 / 403; not twice", async () => {
    const w = await world(1);
    session = efda;
    expect(await refusal(cancelWaste(w.ids[0], { reason: "Duplicate entry" }))).toBe(
      "403 FORBIDDEN"
    );
    session = otherHospital;
    expect(await refusal(cancelWaste(w.ids[0], { reason: "Duplicate entry" }))).toBe(
      "404 NOT_FOUND"
    );
    session = w.staff;
    expect(await refusal(cancelWaste(w.ids[0], { reason: "" }))).toBe("422 VALIDATION_ERROR");
    expect(await cancelWaste(w.ids[0], { reason: "Duplicate entry" })).toMatchObject({
      status: "CANCELLED",
    });
    expect(await statusOf(w.ids[0])).toEqual({
      status: "CANCELLED",
      cancel_reason: "Duplicate entry",
    });
    expect(await refusal(cancelWaste(w.ids[0], { reason: "Again" }))).toBe(
      "409 INVALID_TRANSITION"
    );
  });

  it("blocked while the truck is at the door", async () => {
    const w = await world(1, "ARRIVED");
    session = w.staff;
    expect(await refusal(cancelWaste(w.ids[0], { reason: "Changed our mind" }))).toBe(
      "409 STOP_ARRIVED"
    );
    expect((await statusOf(w.ids[0])).status).toBe("SCHEDULED");
  });

  it("scheduled: leaves its stop when other waste stays on it; the only waste on a stop is refused", async () => {
    const alone = await world(1, "PENDING");
    session = alone.staff;
    expect(await refusal(cancelWaste(alone.ids[0], { reason: "Not needed" }))).toBe(
      "409 LAST_WASTE_ON_STOP"
    );

    const two = await world(2, "PENDING");
    session = two.staff;
    expect(await cancelWaste(two.ids[0], { reason: "Registered twice" })).toMatchObject({
      status: "CANCELLED",
    });
    const links = await q<{ waste_record_id: string; active: boolean }>(
      `SELECT waste_record_id, active FROM trip_stop_waste WHERE trip_stop_id = $1 ORDER BY active`,
      [two.stopId]
    );
    expect(links.find((l) => l.waste_record_id === two.ids[0])?.active).toBe(false);
    expect(links.find((l) => l.waste_record_id === two.ids[1])?.active).toBe(true);
  });
});
