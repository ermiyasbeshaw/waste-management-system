import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { asIdentity, asRole, testDb } from "./helpers";

config({ path: ".env.local", quiet: true });

/**
 * Gate 8 (CLAUDE.md §12): upload → expiry alert → disposal request → EFDA approves → the pharmaceutical waste is on
 * the hospital's waiting list. Builds its own pharmacy and e2e users; the EFDA officer is the seeded dev account.
 */

const digits = (n: number) => String(randomInt(10 ** n)).padStart(n, "0");
const letters = () =>
  Array.from({ length: 3 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]).join("");

function inDays(n: number) {
  const d = new Date(Date.now() + 3 * 3_600_000); // EAT calendar date
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function pharmacy() {
  const code = `EM-${letters()}-${digits(3)}`;
  const [f] = await testDb<{ id: string }>(
    `INSERT INTO facilities (code, name, type, region, address, lat, lng) VALUES ($1, $2, 'PHARMACY', 'Dire Dawa', 'E2E road', 9.6, 41.85) RETURNING id`,
    [code, `E2E Pharmacy ${code}`]
  );
  const staff = `e2e_mstaff_${randomUUID().slice(0, 13)}`;
  await testDb(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_staff', $2, 'E2E Stock Staff', $3)`,
    [staff, f.id, `${staff}@example.test`]
  );
  const admin = `e2e_madmin_${randomUUID().slice(0, 13)}`;
  await testDb(
    `INSERT INTO users (clerk_user_id, role, facility_id, full_name, email) VALUES ($1, 'hospital_admin', $2, 'E2E Stock Admin', $3)`,
    [admin, f.id, `${admin}@example.test`]
  );
  return { code, facilityId: f.id, staff, admin };
}

test("stock upload → expiry alert → disposal request → EFDA approves → waste on the waiting list", async ({
  page,
  request,
}) => {
  const p = await pharmacy();
  const batch = `E2E-${digits(6)}`;
  const csv = `item,strength,form,batch,quantity,unit,expiry date\nMetformin,500 mg,tablet,${batch},120,tablet,${inDays(10)}\n`;

  // 1. Upload with preview.
  await asIdentity(page, p.staff, "hospital_staff");
  await page.goto("/hospital/stock");
  await page.getByLabel("Stock file").setInputFiles({
    name: "stock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("1 line(s) ready")).toBeVisible();
  await page.getByRole("button", { name: "Save 1 line(s)" }).click();
  await expect(page.getByText("Saved: 1 new line(s), 0 updated.")).toBeVisible();

  // 2. The expiry check raises the alert (job route; 401 without the secret).
  expect((await request.post("/api/jobs/stock-alerts")).status()).toBe(401);
  const job = await request.post("/api/jobs/stock-alerts", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(job.status(), await job.text()).toBe(200);
  await page.goto("/hospital/stock");
  const alerts = page.getByRole("region", { name: "Medicine expiry alerts" });
  await expect(alerts.getByText(batch)).toBeVisible();

  // 3. Disposal request — only the hospital admin may create it (owner decision 11 Oct 2026).
  await page.goto("/hospital/stock/requests");
  await expect(
    page.getByText("Only the facility's Hospital Administrator can request")
  ).toBeVisible();
  await asIdentity(page, p.admin, "hospital_admin");
  await page.goto("/hospital/stock/requests");
  await page.getByLabel(`Dispose Metformin batch ${batch}`).check();
  await page.getByLabel("Estimated weight (kg)").fill("2.5");
  await page.getByRole("button", { name: "Request disposal (1 line)" }).click();
  const sent = page.getByText(/Request MD-\d{4}-\d{5} sent to the EFDA officer for approval\./);
  await expect(sent).toBeVisible();
  const requestCode = (await sent.textContent())!.match(/MD-\d{4}-\d{5}/)![0];

  // 4. The driver sees nothing of it.
  await asRole(page, "driver");
  await page.goto("/regulator/approvals");
  await expect(page).not.toHaveURL(/\/regulator\/approvals$/);
  await expect(page.getByText("Medicine Stock")).toHaveCount(0);

  // 5. EFDA approves.
  await asRole(page, "efda_officer");
  await page.goto("/regulator/approvals");
  const card = page.locator("li", { hasText: requestCode });
  await card.getByRole("button", { name: "Approve" }).click();
  const approved = page.getByText(`${requestCode} approved. Waste WR-`);
  await expect(approved).toBeVisible();
  const wasteCode = (await approved.textContent())!.match(/WR-\d{4}-\d{5}/)![0];

  // 6. The pharmaceutical waste is REGISTERED for the pharmacy (waiting for pickup), and the stock went down.
  await asIdentity(page, p.staff, "hospital_staff");
  await page.goto("/hospital/waste");
  await expect(page.getByText(wasteCode).first()).toBeVisible();
  const [w] = await testDb<{ status: string; category: string }>(
    `SELECT w.status, c.code AS category FROM waste_records w JOIN waste_categories c ON c.id = w.category_id
     WHERE w.waste_code = $1`,
    [wasteCode]
  );
  expect(w).toEqual({ status: "REGISTERED", category: "PHARMACEUTICAL" });
  const [s] = await testDb<{ quantity: number }>(
    `SELECT quantity FROM medicine_stock WHERE facility_id = $1 AND batch = $2`,
    [p.facilityId, batch]
  );
  expect(Number(s.quantity)).toBe(0);
});
