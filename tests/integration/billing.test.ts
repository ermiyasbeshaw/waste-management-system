import { randomInt } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toEatDateString } from "@/lib/dates";
import { dueDate } from "@/lib/billing";
import type { ActiveUser, Role } from "@/server/auth/access-rules";
import { AppError } from "@/server/errors";
import {
  cancelInvoice,
  createContract,
  generateMonthlyInvoices,
  invoicePdf,
  issueInvoice,
  settleInvoice,
  updateContract,
  updateContractStatuses,
} from "@/server/services/billing"; // vi.mock calls below are hoisted
import { exportReport } from "@/server/services/exports";
import { checkAuditChain } from "@/server/services/audit-check";
import { getRegulatorEvidence } from "@/server/queries/regulator";
import { closeTestPool, testPool } from "./db";

/**
 * Gate 6: contracts, monthly invoices, issue / settle / cancel, invoice PDF, exports, audit chain check, evidence.
 * Commits on the Neon `test` branch. Billing fixtures use the year 2098, which no seeded contract reaches, so the
 * monthly run only bills this file's contracts and never the demo data.
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

async function refusal(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  );
  if (e instanceof AppError) return `${e.httpStatus} ${e.code}`;
  throw e ?? new Error("expected a refusal");
}

let admin: ActiveUser;
let efda: ActiveUser;
let otherHospital: ActiveUser;
beforeAll(async () => {
  const users = await q<{
    clerk_user_id: string;
    id: string;
    role: Role;
    facility_id: string | null;
  }>(
    `SELECT clerk_user_id, id, role, facility_id FROM users
     WHERE clerk_user_id IN ('dev_super_admin', 'dev_efda_officer', 'dev_hospital_admin')`
  );
  const by = (k: string) => {
    const u = users.find((x) => x.clerk_user_id === k)!;
    return { id: u.id, role: u.role, facilityId: u.facility_id, active: true };
  };
  admin = by("dev_super_admin");
  efda = by("dev_efda_officer");
  otherHospital = by("dev_hospital_admin");
});
afterAll(closeTestPool);

/** A fresh clinic with a hospital administrator who has an email address. */
async function clinic() {
  const code = `BL-${letters()}-${digits(3)}`;
  const [f] = await q<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'Test road', 9.6, 41.85) RETURNING id`,
    [code, `Billing Test Clinic ${code}`]
  );
  const t = `${Date.now()}${digits(3)}`;
  const [u] = await q<{ id: string }>(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_admin', $2, 'Billing Test Admin', $3) RETURNING id`,
    [`test_bl_${t}`, f.id, `bl${t}@example.test`]
  );
  const hospital: ActiveUser = { id: u.id, role: "hospital_admin", facilityId: f.id, active: true };
  return { code, facilityId: f.id, hospital, email: `bl${t}@example.test` };
}

describe("6.1 contracts", () => {
  it("only super_admin; dates, fee and overlap are checked; code CT-YYYY-NNNN", async () => {
    const c = await clinic();
    const input = {
      facilityCode: c.code,
      startDate: "2098-01-01",
      endDate: "2099-01-01",
      monthlyFeeEtb: "2,500.50",
    };
    for (const u of [efda, c.hospital]) {
      session = u;
      expect(await refusal(createContract(input))).toBe("403 FORBIDDEN");
    }
    session = admin;
    expect(await refusal(createContract({ ...input, endDate: "2097-12-31" }))).toBe(
      "422 VALIDATION_ERROR"
    );
    expect(await refusal(createContract({ ...input, monthlyFeeEtb: "12.345" }))).toBe(
      "422 VALIDATION_ERROR"
    );
    const made = await createContract(input);
    expect(made.contractCode).toMatch(/^CT-2098-\d{4}$/);
    const [row] = await q<{ monthly_fee_santim: string; status: string }>(
      `SELECT monthly_fee_santim, status FROM contracts WHERE id = $1`,
      [made.id]
    );
    expect(row).toMatchObject({ monthly_fee_santim: "250050", status: "ACTIVE" });
    expect(
      await refusal(createContract({ ...input, startDate: "2098-06-01", endDate: "2098-09-01" }))
    ).toBe("409 CONFLICT");
  });

  it("a contract ending within the warning window is EXPIRING_SOON; renewal backwards is refused; the daily job expires it", async () => {
    const c = await clinic();
    session = admin;
    const made = await createContract({
      facilityCode: c.code,
      startDate: "2026-01-01",
      endDate: dueDate(today, 10),
      monthlyFeeEtb: "1000",
    });
    const status = async () =>
      (await q<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [made.id]))[0]
        .status;
    expect(await status()).toBe("EXPIRING_SOON");
    expect(
      await refusal(updateContract(made.id, { endDate: "2098-01-01", monthlyFeeEtb: "1000" }))
    ).toBe("409 RENEWAL_IS_NEW_CONTRACT");
    expect(
      await updateContract(made.id, {
        endDate: dueDate(today, 5),
        monthlyFeeEtb: "1200",
        terms: "Updated",
      })
    ).toMatchObject({ status: "EXPIRING_SOON" });

    // The end date arrives (simulated): the daily job moves it to EXPIRED.
    await q(`UPDATE contracts SET end_date = $2::date WHERE id = $1`, [made.id, today]);
    await updateContractStatuses();
    expect(await status()).toBe("EXPIRED");
    expect(
      await refusal(updateContract(made.id, { endDate: "2098-01-01", monthlyFeeEtb: "1" }))
    ).toBe("409 CONTRACT_EXPIRED");
  });
});

describe("6.2 / 6.3 invoices", () => {
  it("monthly drafts: VAT copied, one per contract and month; issue → due date + email; settle; PDF scope", async () => {
    const c = await clinic();
    session = admin;
    const made = await createContract({
      facilityCode: c.code,
      startDate: "2098-01-01",
      endDate: "2099-01-01",
      monthlyFeeEtb: "1000",
    });
    const month = `2098-${String(2 + randomInt(10)).padStart(2, "0")}`;
    const first = await generateMonthlyInvoices(month, null, "test");
    expect(first.created).toBeGreaterThanOrEqual(1);
    const again = await generateMonthlyInvoices(month, null, "test");
    expect(again.created).toBe(0);

    const [vat] = await q<{ n: string }>(
      `SELECT (value #>> '{}') AS n FROM settings WHERE key = 'vat_rate_percent'`
    );
    const invs = await q<{
      id: string;
      invoice_no: string;
      status: string;
      subtotal_santim: string;
      vat_rate_percent: string;
      vat_santim: string;
      total_santim: string;
    }>(
      `SELECT id, invoice_no, status, subtotal_santim, vat_rate_percent, vat_santim, total_santim FROM invoices WHERE contract_id = $1`,
      [made.id]
    );
    expect(invs).toHaveLength(1);
    const inv = invs[0];
    expect(inv.invoice_no).toMatch(new RegExp(`^INV-${month}-\\d{4}$`));
    expect(inv).toMatchObject({ status: "DRAFT", subtotal_santim: "100000" });
    expect(Number(inv.vat_rate_percent)).toBe(Number(vat.n));
    expect(Number(inv.vat_santim)).toBe(Math.round((100000 * Number(vat.n)) / 100));
    expect(Number(inv.total_santim)).toBe(100000 + Number(inv.vat_santim));

    // A hospital never sees drafts; another facility never sees it at all.
    session = c.hospital;
    expect(await refusal(invoicePdf(inv.id))).toBe("404 NOT_FOUND");
    session = admin;
    expect(Buffer.from((await invoicePdf(inv.id)).bytes.slice(0, 5)).toString()).toBe("%PDF-");

    session = efda;
    expect(await refusal(issueInvoice(inv.id))).toBe("403 FORBIDDEN");
    session = admin;
    const issued = await issueInvoice(inv.id);
    const [days] = await q<{ n: string }>(
      `SELECT (value #>> '{}') AS n FROM settings WHERE key = 'invoice_due_days'`
    );
    expect(issued).toMatchObject({ status: "ISSUED", dueDate: dueDate(today, Number(days.n)) });
    expect(await refusal(issueInvoice(inv.id))).toBe("409 INVALID_TRANSITION");
    const mail = await q(
      `SELECT id FROM outbox_messages WHERE template = 'invoice.issued' AND recipient = $1`,
      [c.email]
    );
    expect(mail).toHaveLength(1);

    session = c.hospital;
    expect((await invoicePdf(inv.id)).fileName).toBe(`${inv.invoice_no}.pdf`);
    session = otherHospital;
    expect(await refusal(invoicePdf(inv.id))).toBe("404 NOT_FOUND");

    session = admin;
    expect(
      await refusal(settleInvoice(inv.id, { reference: "BANK-1", settledOn: "2999-01-01" }))
    ).toBe("422 VALIDATION_ERROR");
    expect(
      await settleInvoice(inv.id, { reference: "BANK-778812", settledOn: today })
    ).toMatchObject({
      status: "SETTLED_OFFLINE",
    });
    expect(await refusal(cancelInvoice(inv.id, { reason: "Too late" }))).toBe(
      "409 INVALID_TRANSITION"
    );
    const audits = await q(
      `SELECT action FROM audit_logs WHERE entity_type = 'invoice' AND entity_id = $1::text ORDER BY seq`,
      [inv.id]
    );
    expect(audits.map((a) => a.action)).toEqual([
      "invoice.created",
      "invoice.downloaded",
      "invoice.issued",
      "invoice.downloaded",
      "invoice.settled_offline",
    ]);
  });

  it("cancel needs a reason", async () => {
    const c = await clinic();
    session = admin;
    const made = await createContract({
      facilityCode: c.code,
      startDate: "2098-01-01",
      endDate: "2099-01-01",
      monthlyFeeEtb: "300",
    });
    await generateMonthlyInvoices("2098-12", null, "test");
    const [inv] = await q<{ id: string }>(`SELECT id FROM invoices WHERE contract_id = $1`, [
      made.id,
    ]);
    expect(await refusal(cancelInvoice(inv.id, { reason: "" }))).toBe("422 VALIDATION_ERROR");
    expect(await cancelInvoice(inv.id, { reason: "Contract signed by mistake" })).toMatchObject({
      status: "CANCELLED",
    });
  });
});

describe("6.4 exports and 6.5 audit", () => {
  it("hospital exports only its own facility; XLSX and PDF; EFDA cannot export invoices; exports audited", async () => {
    session = otherHospital;
    const x = await exportReport("waste", "xlsx", "test");
    expect(Buffer.from(x.bytes.slice(0, 2)).toString()).toBe("PK");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(x.bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.worksheets[0];
    const facilities = new Set<string>();
    sheet.eachRow((row, n) => {
      if (n > 1) facilities.add(String(row.getCell(2).value));
    });
    expect(facilities.size).toBe(1);
    const [own] = await q<{ name: string }>(`SELECT name FROM facilities WHERE id = $1`, [
      otherHospital.facilityId,
    ]);
    expect(Array.from(facilities)[0]).toBe(own.name);

    const pdf = await exportReport("certificates", "pdf", "test");
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe("%PDF-");

    session = efda;
    expect(await refusal(exportReport("invoices", "xlsx"))).toBe("403 FORBIDDEN");
    expect((await exportReport("audit", "xlsx")).fileName).toMatch(/^safewaste-audit-/);
    expect(await refusal(exportReport("payroll", "xlsx"))).toBe("404 NOT_FOUND");
    expect(await refusal(exportReport("waste", "csv"))).toBe("422 VALIDATION_ERROR");
    const logged = await q(
      `SELECT id FROM audit_logs WHERE action = 'export.downloaded' AND actor_user_id = $1`,
      [efda.id]
    );
    expect(logged.length).toBeGreaterThanOrEqual(1);
  });

  it("the EFDA officer can verify the hash chain and read the evidence; hospitals cannot", async () => {
    session = efda;
    expect(await checkAuditChain()).toMatchObject({ ok: true });
    const evidence = await getRegulatorEvidence();
    expect(Array.isArray(evidence.overrides)).toBe(true);
    expect(evidence.arrivals.every((a) => a.geofenceOk !== true)).toBe(true);
    session = otherHospital;
    expect(await refusal(checkAuditChain())).toBe("403 FORBIDDEN");
    expect(await refusal(getRegulatorEvidence())).toBe("403 FORBIDDEN");
  });
});
