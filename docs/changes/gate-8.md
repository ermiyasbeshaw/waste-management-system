# Change log — Gate 8 (medicine stock and expiry, modules 21–22)

Started 11 Oct 2026. Owner decision (11 Oct 2026): CLAUDE.md §12 is APPROVED; built as one gate without per-step stops.
No git; this file replaces commit history. Secret values are never written here.

## ASSUMPTIONS — please confirm or correct

| # | Assumption | Where |
|---|---|---|
| A1 | **Excel / CSV columns:** a header row with `item, strength, form, batch, quantity, unit, expiry date` in any order and case; also accepted: `expiry_date`, `expiry`, `exp date`, `qty`, `batch no`, `dosage form`, `medicine`. Required: item, batch, quantity, unit, expiry date (strength and form may be empty) | `src/lib/stock-import.ts` |
| A2 | **Hospital staff may create disposal requests** (not only the hospital admin) — as the owner's "who sees what" says; the owner asked to confirm | `src/server/services/medicine.ts` |
| A3 | **Email wording** of the expiry alert: English draft ("Medicine expiry alert — <facility> (n lines)", a list of item, batch, quantity, days left) | `src/server/outbox/templates.ts` |
| A4 | Quantity is a whole number ≥ 1; dates YYYY-MM-DD, DD/MM/YYYY or real spreadsheet dates (Gregorian); at most 2 000 rows and 5 MB per file | `src/lib/stock-import.ts` |
| A5 | A line is identified by item + strength + form + batch inside the facility; **uploading the same batch again replaces its quantity, unit and expiry** (the upload is a stock count) | service |
| A6 | A request also asks for **containers and estimated weight**, because the approved request becomes a waste record, which needs both (CLAUDE.md §6) | `src/lib/validation/medicine.ts` |
| A7 | Quantities are not reserved while a request waits; they are checked again when EFDA approves (409 if the stock went down) | service |
| A8 | If a line passes several thresholds at once (e.g. uploaded 5 days before expiry), all are recorded and **one** email lists the line; one email per facility and recipient per run | service |
| A9 | The approved request's waste record is registered **in the requester's name** (registered_by = the hospital user who asked); the EFDA approval is a separate audit entry | service |
| A10 | Request code format `MD-YYYY-NNNNN` (CLAUDE.md §9 has no code for requests) | `src/lib/codes.ts` |

## 8.1 Data and workflow

| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | changed | §12 APPROVED with the owner's rules; §3 EFDA's one write; §5 `medicine_request_status`; §7 `expiry_alert_days` |
| `src/lib/statuses.ts` | changed | PENDING_APPROVAL / APPROVED / REJECTED with badge text |
| `src/server/db/schema/medicine.ts`, `enums.ts`, `index.ts`, `platform.ts` | created / changed | `medicine_stock` (unique line per facility, quantity ≥ 0, never deleted), `medicine_stock_alerts` (unique line + threshold), `medicine_disposal_requests` (decision and waste-link checks), `medicine_disposal_request_lines` (snapshot); code scope `medicine_request` |
| `drizzle/0007_gate8_medicine_stock.sql` | created | generated + hand-written: not at the disposal site (trigger), updated_at triggers, setting row `expiry_alert_days = [90, 30, 7]`. Applied to `dev` and `test` |
| `src/lib/codes.ts` | changed | `MD-YYYY-NNNNN` |
| `src/lib/validation/settings.ts`, `src/components/admin/settings-editor.tsx` | changed | `expiry_alert_days` (list of days), editable on Admin → Settings |
| `src/server/workflow/table.ts`, `engine.ts` | changed | entity `medicine_request`: PENDING_APPROVAL → APPROVED / REJECTED (reason), who = efda_officer only; `EFDA_WRITABLE_ENTITIES` — every other EFDA move stays 403 before any row is read |
| `tests/unit/workflow-table.test.ts`, `tests/unit/settings.test.ts` | changed | new moves; EFDA only in the medicine rules; 18 settings |
| `vitest.config.ts` | changed | unit test timeout 20 s (PDF / QR tests exceeded 5 s under load) |

## 8.2 Stock

| File | Action | Why |
|---|---|---|
| `src/lib/stock-import.ts` | created | CSV parsing (quotes, BOM, `;`), header aliases, per-row errors and duplicates, date normalising, thresholds |
| `src/server/integrations/xlsx.ts` | changed | `readXlsxTable` (first sheet; dates, formulas, rich text) |
| `src/server/services/medicine.ts` | created | `previewStockFile`, `saveStockImport` (one audit entry with every before / after), `addStockLine`, `updateStockLine`, `archiveStockLine` — hospital roles, own facility (another facility's line = 404) |
| `src/app/(desk)/hospital/stock/{page,actions}.ts(x)` | created | upload with preview, add, edit / remove, filters, alerts, export |
| `src/components/medicine/{stock-upload,stock-line-form,stock-table,stock-filters}.tsx` | created | UI |
| `next.config.mjs` | changed | Server Action body limit 6 MB (file upload) |

## 8.3 Expiry alerts

| File | Action | Why |
|---|---|---|
| `src/server/services/medicine.ts` | (same) | `computeStockExpiryAlerts(day)`: thresholds + expiry day, once per line (unique row), email via the outbox to the facility's hospital_admin users and every efda_officer, audit per facility |
| `src/server/services/billing.ts` | changed | the daily job runs it |
| `src/app/api/jobs/stock-alerts/route.ts` | created | the same check on its own (CRON_SECRET) |
| `src/server/outbox/templates.ts` | changed | `stock.expiry_alert` email (A3) |
| `src/components/medicine/{stock-alerts-panel,stock-alerts-widget}.tsx` | created | dashboard panel on /hospital (own), /admin/alerts (all), /regulator (all) |

## 8.4 Disposal requests

| File | Action | Why |
|---|---|---|
| `src/lib/validation/medicine.ts` | created | request (lines, containers, weight, note) and decision (approve / reject + reason) |
| `src/server/services/medicine.ts` | (same) | `createDisposalRequest` (own facility, quantities checked, idempotency key, audited); `decideDisposalRequest` (efda only; APPROVE in one transaction: stock reduced → PHARMACEUTICAL waste REGISTERED with containers LABELLED → request APPROVED and linked; REJECT with reason) |
| `src/app/(desk)/hospital/stock/requests/page.tsx`, `src/components/medicine/request-form.tsx` | created | new request, list |
| `src/app/(desk)/regulator/approvals/{page,actions}.ts(x)`, `src/components/medicine/requests-list.tsx` | created | EFDA approve / reject |

## 8.5 Read pages, navigation, exports, permissions

| File | Action | Why |
|---|---|---|
| `src/server/queries/medicine.ts`, `src/types/view-models/medicine.ts` | created | scoped reads: hospital roles own facility in SQL; SA / EFDA all (facility filter); driver / disposal operator 403 |
| `src/app/(desk)/regulator/stock/page.tsx`, `src/app/(desk)/admin/stock/page.tsx` | created | read-only lists, alerts, requests (admin) |
| `src/components/shared/sidebar.tsx`, `hospital-shell.tsx`, `regulator-scope.tsx`, `admin/layout.tsx` | changed | menu and tabs (nothing for driver / disposal operator) |
| `src/server/services/exports.ts`, `export-links.tsx` | changed | reports `stock` and `medicine-requests` in each role's scope |

## Tests

| File | What |
|---|---|
| `tests/unit/stock-import.test.ts` | 9: CSV (quotes, BOM, `;`), preview (any order, DD/MM/YYYY, errors per row, duplicates, missing columns), dates, XLSX read back, thresholds |
| `tests/integration/medicine.test.ts` | 4: own facility only, replace by batch, SA / EFDA see all, driver / operator / EFDA / SA cannot write stock, audit; alerts once per threshold (90, 30 → 7 → 0) with email to the facility admin and EFDA; request → EFDA approves (SA / hospital / driver / operator 403) → PHARMACEUTICAL waste REGISTERED, containers LABELLED, stock reduced, audit trail; rejection needs a reason, stock unchanged |
| `tests/permissions/matrix.test.ts` | +13 functions; EFDA's only write is `decideDisposalRequest`; driver and disposal operator have nothing of stock (88 tests) |
| `tests/e2e/stock.spec.ts` | upload CSV with preview → alert job → panel → request → driver sees nothing → EFDA approves → waste on the hospital's list, stock 0 |

## Final checks (11 Oct 2026)

typecheck ✔ · lint ✔ · unit 159/159 ✔ · build ✔ · e2e 91/91 ✔ · integration 269/271 in the full run; the 2 failures
were tests, fixed and rerun green (24/24): the schema test still counted 25 tables / 17 settings (now 29 / 18), and
an overdue-pickup check used "> 7 days" where 7.x days shows as 7.

Also fixed during the gate: after an EFDA decision the page refresh removed the confirmation together with the
buttons — the message is now shown above the list.

## Owner decisions applied (11 Oct 2026, evening)

1. **Columns:** only `item, strength, form, batch, quantity, unit, expiry date` (any order / case; `expiry_date` = same
   name). The other names (qty, expiry, batch no, medicine, …) are no longer recognised — A1 closed.
2. **Only the hospital_admin creates disposal requests** (staff upload stock and see requests) — A2 closed. And
   **medicine needs EFDA approval:** the PHARMACEUTICAL category can no longer be registered directly (409
   NEEDS_EFDA_APPROVAL) and is not offered on the registration form; it only enters through an approved request.
   Sharps and other waste stay direct. ASSUMPTION: PHARMACEUTICAL is the only medicine category.
3. **Email wording** accepted (A3). 4. A5, A6, A9 accepted.

| File | Action | Why |
|---|---|---|
| `src/lib/stock-import.ts`, `stock-upload.tsx` | changed | exact column names only |
| `src/lib/validation/waste.ts` | changed | `EFDA_APPROVAL_CATEGORIES = ["PHARMACEUTICAL"]` |
| `src/server/services/waste.ts` | changed | `registerWasteTx(…, { viaApprovedRequest })`: medicine refused unless it comes from an approved request |
| `src/server/services/medicine.ts` | changed | requests: hospital_admin only; approval registers with `viaApprovedRequest: true` |
| `src/server/queries/hospital.ts` | changed | the registration form leaves out medicine categories (first version passed the list wrongly to the database and broke the form — found by e2e, fixed, now covered by an integration test) |
| `src/app/(desk)/hospital/waste/new/page.tsx`, `src/app/(desk)/hospital/stock/requests/page.tsx` | changed | note pointing to disposal requests; request form for the admin only |
| `CLAUDE.md` §12 | changed | the decisions above. Note: the formatter also re-aligned the tables of CLAUDE.md (spacing only, no wording changed) |
| tests (unit, integration, matrix, e2e) | changed | column names; staff 403 on requests; direct medicine registration 409; form without the medicine category; e2e request by the admin |
| `docs/SafeWaste-System-Guide.docx` | created | Word guide for the owner: features, workflows, settings, what is left (step by step), open questions |

## Checks after the owner decisions (11 Oct 2026)

typecheck ✔ · lint ✔ · unit 160/160 ✔ · build ✔ · integration 271/272 in the full run + the failing check fixed and
rerun (7/7) · e2e 89/91 in the full run + both reruns green (6/6, 3/3).
Test-data effects fixed in the tests: the "not ready" list (max 100) and the invoice ledger page now hold many test
rows. Product change: the disposal check-in list shows the most recently started trucks first (was: by trip code).

How to undo: restore the changed files from the pre-Gate-8 backup folder, delete the created files, and drop the
new tables / type in a migration (the tables are empty except for test data).
