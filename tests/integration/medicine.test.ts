import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toEatDateString } from "@/lib/dates";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import {
  archiveStockLine,
  computeStockExpiryAlerts,
  createDisposalRequest,
  decideDisposalRequest,
  saveStockImport,
  updateStockLine,
} from "@/server/services/medicine"; // vi.mock calls below are hoisted
import { getDisposalRequests, getStockAlerts, getStockPage } from "@/server/queries/medicine";
import { registerWaste } from "@/server/services/waste";
import { getHospitalCategories } from "@/server/queries/hospital";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 8 (CLAUDE.md §12): medicine stock, expiry alerts and EFDA-approved disposal requests, on the Neon `test`
 * branch (commits). Each test builds its own clinics and users.
 */
let session: ActiveUser | null = null;
vi.mock("@/server/auth/current-user", () => ({
  requireRole: vi.fn(async (...roles: Role[]) => {
    if (!session || !roles.includes(session.role)) throw new AppError("FORBIDDEN", 403);
    return session;
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await testPool().query(sql, params)).rows as T[];
const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");
const today = toEatDateString(new Date());
const plusDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

const dev = {} as Record<Role, ActiveUser>;
let efdaEmail = "";
beforeAll(async () => {
  const rows = await q<{ id: string; role: Role; facility_id: string | null; email: string }>(
    `SELECT id, role, facility_id, email FROM users WHERE clerk_user_id = ANY($1::text[])`,
    [["dev_super_admin", "dev_efda_officer", "dev_driver", "dev_disposal_operator"]]
  );
  for (const r of rows)
    dev[r.role] = { id: r.id, role: r.role, facilityId: r.facility_id, active: true };
  efdaEmail = rows.find((r) => r.role === "efda_officer")!.email.toLowerCase();
});
afterAll(closeTestPool);

/** A clinic with a hospital administrator (with email) and a hospital staff member. */
async function clinic() {
  const code = `MS-${letters()}-${digits(3)}`;
  const [f] = await q<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'PHARMACY', 'Dire Dawa', 'Test road', 9.6, 41.85) RETURNING id`,
    [code, `Stock Test Pharmacy ${code}`]
  );
  const t = `${Date.now()}${digits(4)}`;
  const mk = async (role: "hospital_admin" | "hospital_staff") => {
    const email = `ms${role[9]}${t}@example.test`;
    const [u] = await q<{ id: string }>(
      `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, $2, $3, 'Stock Tester', $4) RETURNING id`,
      [`test_ms_${role}_${t}`, role, f.id, email]
    );
    return { user: { id: u.id, role, facilityId: f.id, active: true } as ActiveUser, email };
  };
  const admin = await mk("hospital_admin");
  const staff = await mk("hospital_staff");
  return { code, facilityId: f.id, admin: admin.user, adminEmail: admin.email, staff: staff.user };
}

const line = (batch: string, quantity: number, expiryDate: string) => ({
  item: "Amoxicillin",
  strength: "250 mg",
  form: "capsule",
  batch,
  quantity,
  unit: "capsule",
  expiryDate,
});

async function stockIdOf(facilityId: string, batch: string) {
  return (
    await q<{ id: string; quantity: number }>(
      `SELECT id, quantity FROM medicine_stock WHERE facility_id = $1 AND batch = $2`,
      [facilityId, batch]
    )
  )[0];
}

describe("8.2 stock (scope and history)", () => {
  it("own facility only; the same batch replaces its quantity; driver and disposal operator get 403", async () => {
    const a = await clinic();
    const b = await clinic();
    session = a.staff;
    expect(
      await saveStockImport({
        lines: [line("A-1", 100, "2027-06-30"), line("A-2", 50, "2027-07-31")],
      })
    ).toEqual({ created: 2, updated: 0 });
    expect(await saveStockImport({ lines: [line("a-1", 80, "2027-06-30")] })).toEqual({
      created: 0,
      updated: 1,
    });
    const a1 = await stockIdOf(a.facilityId, "A-1");
    expect(Number(a1.quantity)).toBe(80);

    const seenBy = async (u: ActiveUser, facility: string | null = null) =>
      (session = u) && (await getStockPage("all", facility, null)).rows.map((r) => r.batch);
    expect(await seenBy(a.admin)).toEqual(expect.arrayContaining(["A-1", "A-2"]));
    expect(await seenBy(b.admin)).not.toContain("A-1");
    expect(await seenBy(b.admin, a.code)).not.toContain("A-1"); // the facility filter is ignored for hospitals
    expect(await seenBy(dev.efda_officer, a.code)).toEqual(["A-1", "A-2"]);
    expect(await seenBy(dev.super_admin, a.code)).toEqual(["A-1", "A-2"]);

    session = b.staff;
    expect(await refusal(updateStockLine(a1.id, line("A-1", 1, "2027-06-30")))).toBe(
      "404 NOT_FOUND"
    );
    expect(await refusal(archiveStockLine(a1.id))).toBe("404 NOT_FOUND");
    for (const u of [
      dev.driver,
      dev.disposal_operator,
      dev.efda_officer,
      dev.super_admin,
      a.admin,
      b.admin,
    ]) {
      session = u;
      expect(await refusal(saveStockImport({ lines: [line("X", 1, "2027-01-01")] })), u.role).toBe(
        "403 FORBIDDEN"
      );
    }
    for (const u of [dev.driver, dev.disposal_operator]) {
      session = u;
      expect(await refusal(getStockPage("all", null, null)), u.role).toBe("403 FORBIDDEN");
      expect(await refusal(getStockAlerts()), u.role).toBe("403 FORBIDDEN");
      expect(await refusal(getDisposalRequests()), u.role).toBe("403 FORBIDDEN");
    }

    session = a.staff;
    await updateStockLine(a1.id, line("A-1", 75, "2027-05-31"));
    await archiveStockLine((await stockIdOf(a.facilityId, "A-2")).id);
    const audit = await q<{ action: string }>(
      `SELECT action FROM audit_logs WHERE (entity_type = 'medicine_stock' AND entity_id IN ($1, $2))
       ORDER BY seq`,
      [a.facilityId, a1.id]
    );
    expect(audit.map((x) => x.action)).toEqual([
      "stock.imported",
      "stock.imported",
      "stock.updated",
    ]);
  });
});

describe("8.3 expiry alerts", () => {
  it("each threshold alerts once per line; email to the facility admin and to EFDA; never to others", async () => {
    const a = await clinic();
    session = a.staff;
    await saveStockImport({ lines: [line("EXP-1", 10, plusDays(today, 20))] });
    const id = (await stockIdOf(a.facilityId, "EXP-1")).id;
    const thresholds = async () =>
      (
        await q<{ threshold_days: number }>(
          `SELECT threshold_days FROM medicine_stock_alerts WHERE stock_id = $1 ORDER BY threshold_days DESC`,
          [id]
        )
      ).map((r) => r.threshold_days);
    const mails = async (to: string) =>
      (
        await q<{ payload: { data: { facilityName: string } } }>(
          `SELECT payload FROM outbox_messages WHERE template = 'stock.expiry_alert' AND recipient = $1`,
          [to]
        )
      ).filter((m) => m.payload.data.facilityName.includes(a.code));

    await computeStockExpiryAlerts(today);
    expect(await thresholds()).toEqual([90, 30]);
    expect(await mails(a.adminEmail)).toHaveLength(1);
    expect(await mails(efdaEmail)).toHaveLength(1);

    await computeStockExpiryAlerts(today); // same day again: nothing new
    expect(await thresholds()).toEqual([90, 30]);
    expect(await mails(a.adminEmail)).toHaveLength(1);

    await computeStockExpiryAlerts(plusDays(today, 14)); // 6 days left
    expect(await thresholds()).toEqual([90, 30, 7]);
    await computeStockExpiryAlerts(plusDays(today, 20)); // the expiry day
    expect(await thresholds()).toEqual([90, 30, 7, 0]);
    expect(await mails(a.adminEmail)).toHaveLength(3);

    session = a.staff;
    expect((await getStockAlerts()).map((x) => x.batch)).toContain("EXP-1");
    session = dev.efda_officer;
    expect((await getStockAlerts(a.code)).map((x) => x.batch)).toEqual(["EXP-1"]);
  });
});

describe("8.4 disposal requests", () => {
  it("admin request → EFDA approves → PHARMACEUTICAL waste REGISTERED, containers LABELLED, stock reduced, audited", async () => {
    const a = await clinic();
    const b = await clinic();
    session = a.staff;
    await saveStockImport({ lines: [line("RQ-1", 100, plusDays(today, 5))] });
    const stock = await stockIdOf(a.facilityId, "RQ-1");
    session = b.staff;
    await saveStockImport({ lines: [line("RQ-B", 5, "2027-01-01")] });
    const bStock = await stockIdOf(b.facilityId, "RQ-B");

    const body = { lines: [{ stockId: stock.id, quantity: 30 }], containerCount: 2, weightKg: 3.5 };
    // Owner decision (11 Oct 2026): only the hospital admin creates requests.
    session = a.staff;
    expect(await refusal(createDisposalRequest(body, { idempotencyKey: randomUUID() }))).toBe(
      "403 FORBIDDEN"
    );
    session = a.admin;
    expect(
      await refusal(
        createDisposalRequest(
          { ...body, lines: [{ stockId: stock.id, quantity: 101 }] },
          { idempotencyKey: randomUUID() }
        )
      )
    ).toBe("409 QUANTITY_TOO_HIGH");
    expect(
      await refusal(
        createDisposalRequest(
          { ...body, lines: [{ stockId: bStock.id, quantity: 1 }] },
          { idempotencyKey: randomUUID() }
        )
      )
    ).toBe("404 NOT_FOUND");
    const key = randomUUID();
    const req = await createDisposalRequest(body, { idempotencyKey: key });
    expect(req.requestCode).toMatch(/^MD-\d{4}-\d{5}$/);
    expect(await createDisposalRequest(body, { idempotencyKey: key })).toEqual(req); // same tap again

    session = b.admin;
    expect((await getDisposalRequests()).map((r) => r.id)).not.toContain(req.id);

    for (const u of [dev.super_admin, a.admin, a.staff, dev.driver, dev.disposal_operator]) {
      session = u;
      expect(await refusal(decideDisposalRequest(req.id, { decision: "APPROVE" })), u.role).toBe(
        "403 FORBIDDEN"
      );
    }
    session = dev.efda_officer;
    const done = await decideDisposalRequest(req.id, { decision: "APPROVE" });
    expect(done).toMatchObject({ status: "APPROVED" });
    expect(done.wasteCode).toMatch(/^WR-\d{4}-\d{5}$/);
    expect(await refusal(decideDisposalRequest(req.id, { decision: "APPROVE" }))).toBe(
      "409 INVALID_TRANSITION"
    );

    const [w] = await q<{
      id: string;
      status: string;
      category: string;
      facility_id: string;
      container_count: number;
    }>(
      `SELECT w.id, w.status, c.code AS category, w.facility_id, w.container_count
       FROM medicine_disposal_requests r JOIN waste_records w ON w.id = r.waste_record_id
       JOIN waste_categories c ON c.id = w.category_id WHERE r.id = $1`,
      [req.id]
    );
    expect(w).toMatchObject({
      status: "REGISTERED",
      category: "PHARMACEUTICAL",
      facility_id: a.facilityId,
      container_count: 2,
    });
    const containers = await q<{ status: string }>(
      `SELECT status FROM containers WHERE waste_record_id = $1`,
      [w.id]
    );
    expect(containers.map((c) => c.status)).toEqual(["LABELLED", "LABELLED"]);
    expect(Number((await stockIdOf(a.facilityId, "RQ-1")).quantity)).toBe(70);

    const audit = await q<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_id IN ($1, $2) ORDER BY seq`,
      [req.id, w.id]
    );
    expect(audit.map((x) => x.action)).toEqual([
      "medicine_request.created",
      "stock.reduced",
      "waste.registered",
      "medicine_request.approved",
    ]);
  });

  it("rejection needs a reason and leaves the stock unchanged", async () => {
    const a = await clinic();
    session = a.admin;
    await saveStockImport({ lines: [line("RJ-1", 10, "2027-01-01")] });
    const stock = await stockIdOf(a.facilityId, "RJ-1");
    const req = await createDisposalRequest(
      { lines: [{ stockId: stock.id, quantity: 10 }], containerCount: 1, weightKg: 1 },
      { idempotencyKey: randomUUID() }
    );
    session = dev.efda_officer;
    expect(await refusal(decideDisposalRequest(req.id, { decision: "REJECT", reason: "" }))).toBe(
      "422 VALIDATION_ERROR"
    );
    expect(
      await decideDisposalRequest(req.id, {
        decision: "REJECT",
        reason: "Not expired; redistribute instead",
      })
    ).toMatchObject({ status: "REJECTED", wasteCode: null });
    const [r] = await q<{
      status: string;
      decision_reason: string;
      waste_record_id: string | null;
    }>(
      `SELECT status, decision_reason, waste_record_id FROM medicine_disposal_requests WHERE id = $1`,
      [req.id]
    );
    expect(r).toEqual({
      status: "REJECTED",
      decision_reason: "Not expired; redistribute instead",
      waste_record_id: null,
    });
    expect(Number((await stockIdOf(a.facilityId, "RJ-1")).quantity)).toBe(10);
  });

  it("medicine waste cannot be registered directly — only through an approved request; other waste can", async () => {
    const a = await clinic();
    session = a.staff;
    expect(
      await refusal(
        registerWaste(
          { categoryCode: "PHARMACEUTICAL", containerCount: 1, weightKg: 1 },
          { idempotencyKey: randomUUID() }
        )
      )
    ).toBe("409 NEEDS_EFDA_APPROVAL");
    const sharps = await registerWaste(
      { categoryCode: "SHARPS", containerCount: 1, weightKg: 1 },
      { idempotencyKey: randomUUID() }
    );
    expect(sharps.wasteCode).toMatch(/^WR-\d{4}-\d{5}$/);
    // The direct registration form does not offer the medicine category.
    const codes = (await getHospitalCategories()).map((c) => c.code);
    expect(codes).toContain("SHARPS");
    expect(codes).not.toContain("PHARMACEUTICAL");
  });
});
