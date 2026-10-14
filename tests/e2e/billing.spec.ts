import { randomInt } from "node:crypto";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { asRole, testDb } from "./helpers";

config({ path: ".env.local", quiet: true });

/**
 * Gate 6: contracts, monthly drafts, issuing, exports, audit chain check — through the real UI and routes.
 * Billing fixtures use the year 2098 (no seeded contract reaches it). The daily job is only called WITHOUT the
 * secret here: with it, it would also issue the seeded PENDING / FAILED demo certificates.
 */

const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

async function freshClinic() {
  const code = `EB-${letters()}-${digits(3)}`;
  const name = `E2E Billing Clinic ${code}`;
  await testDb(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'CLINIC', 'Dire Dawa', 'E2E road', 9.6, 41.85)`,
    [code, name]
  );
  return { code, name };
}

test.describe("billing and reporting (Gate 6)", () => {
  test("admin creates a contract, the monthly job drafts its invoice, the admin issues it", async ({
    page,
    request,
  }) => {
    const clinic = await freshClinic();
    await asRole(page, "super_admin");
    await page.goto("/admin/contracts");
    await page.getByRole("button", { name: "New contract" }).click();
    await page.getByLabel("Facility").selectOption(clinic.code);
    await page.getByLabel("Monthly fee (ETB, before VAT)").fill("1500");
    await page.getByLabel("Start date").fill("2098-01-01");
    await page.getByLabel("End date (first day no longer covered)").fill("2099-01-01");
    await page.getByRole("button", { name: "Create contract" }).click();
    await expect(page.getByText(/Contract CT-2098-\d{4} created\./)).toBeVisible();

    expect((await request.post("/api/jobs/monthly-invoices")).status()).toBe(401);
    const month = `2098-${String(2 + randomInt(10)).padStart(2, "0")}`;
    const job = await request.post("/api/jobs/monthly-invoices", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      data: { month },
    });
    expect(job.status(), await job.text()).toBe(200);
    expect((await job.json()).created).toBeGreaterThanOrEqual(1);

    const [inv] = await testDb<{ invoice_no: string }>(
      `SELECT i.invoice_no FROM invoices i JOIN facilities f ON f.id = i.facility_id
       WHERE f.code = $1 AND to_char(i.period_start, 'YYYY-MM') = $2`,
      [clinic.code, month]
    );
    // Open the ledger page that starts at this invoice (the newest numbers come first, and other runs may have
    // left higher numbers on the test database).
    const next = inv.invoice_no.replace(/\d{4}$/, (n) => String(Number(n) + 1).padStart(4, "0"));
    await page.goto(`/admin/finance?after=${next}`);
    await page.getByPlaceholder("Search invoice # or hospital...").fill(inv.invoice_no);
    const row = page.locator("tr", { hasText: inv.invoice_no });
    await row.getByRole("button", { name: "Issue" }).click();
    await expect(row.getByText("Issued", { exact: true }).first()).toBeVisible();
    const [after] = await testDb<{ status: string; due_date: string | null }>(
      `SELECT status, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM invoices WHERE invoice_no = $1`,
      [inv.invoice_no]
    );
    expect(after.status).toBe("ISSUED");
    expect(after.due_date).not.toBeNull();
  });

  test("exports respect the role; the daily job needs its secret", async ({ page, request }) => {
    await asRole(page, "hospital_admin");
    const xlsx = await page.request.get("/api/export/waste?format=xlsx");
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const pdf = await page.request.get("/api/export/invoices?format=pdf");
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    await asRole(page, "driver");
    expect((await page.request.get("/api/export/waste?format=xlsx")).status()).toBe(403);
    await asRole(page, "efda_officer");
    expect((await page.request.get("/api/export/invoices?format=xlsx")).status()).toBe(403);
    expect((await page.request.get("/api/export/audit?format=pdf")).status()).toBe(200);

    expect((await request.post("/api/jobs/daily-checks")).status()).toBe(401);
  });

  test("the EFDA officer verifies the audit hash chain", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/regulator/audit");
    await page.getByRole("button", { name: "Verify the hash chain" }).click();
    await expect(page.getByText(/Chain intact: \d+ entries checked\./)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Handover overrides (90 days)")).toBeVisible();
  });
});
