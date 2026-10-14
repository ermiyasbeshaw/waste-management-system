# Change log — Gate 6 (billing and reporting)

Started 10 Oct 2026. No git; this file replaces commit history for Gate 6. Secret values are never written here.
Owner instruction (10 Oct 2026): "continue with all sub don't stop until done" — tasks 6.1–6.5 are built in one go.

ASSUMPTIONS to confirm with the client (written in `src/lib/billing.ts` as well):
- A month is billed when it starts inside the contract; the full monthly fee is charged (no part-month proration).
- VAT = subtotal × rate / 100, rounded half up to the santim (same rule as the seed).
- The monthly job bills the previous calendar month (EAT) unless a month is given.
- Renewal = a new contract; changing a running contract may not move it back from EXPIRING_SOON to ACTIVE.
- Invoice and certificate emails go to the facility's hospital administrators only.
- The invoice PDF has no TIN / legal invoice fields until the client provides them.
- Exports: at most 5 000 rows, newest first; no person names, phones or emails.

## 6.1 Contracts and the daily job

| File | Action | Why |
|---|---|---|
| `src/lib/billing.ts` | created | pure money / period rules: VAT, totals, month periods, previous month, billable month, due date, contract status for a date |
| `src/lib/validation/billing.ts` | created | contract (ETB → santim, max 2 decimals), contract change, month, settlement (reference + date), cancel reason |
| `src/server/services/_errors.ts` | changed | exclusion violations (23P01) → 409, e.g. "This facility already has a contract in that period." |
| `src/server/services/billing.ts` | created | `createContract` (CT-YYYY-NNNN, EXPIRING_SOON at once when inside the warning window), `updateContract` (end date, fee, terms; audited), `updateContractStatuses`, `runDailyChecks` (contracts, certificate retries, idempotency keys > 24 h, derived alert counts) |
| `src/app/api/jobs/daily-checks/route.ts` | created | POST with CRON_SECRET |
| `src/app/(desk)/admin/contracts/actions.ts`, `src/components/admin/contract-editor.tsx` | created | "New contract" form and per-row "Change" |
| `src/components/admin/contracts-table.tsx`, `widgets.tsx` | changed | fee column, change column, facility list for the form |
| `src/server/queries/admin.ts`, `src/types/view-models/admin.ts` | changed | contract `terms` |

## 6.2 Monthly invoices

| File | Action | Why |
|---|---|---|
| `src/server/services/billing.ts` | (same) | `generateMonthlyInvoices(month)`: running contracts (ACTIVE / EXPIRING_SOON), locked; existing (contract, month) skipped, so running twice creates nothing; VAT rate copied; DRAFT; audited (`invoice.created`) |
| `src/app/api/jobs/monthly-invoices/route.ts` | created | POST-only with CRON_SECRET; optional `{ "month": "YYYY-MM" }` |
| `src/components/admin/invoice-actions.tsx` (`MonthlyInvoicesPanel`) | created | super_admin "Create monthly drafts" (any month) |

## 6.3 Issue / settle / cancel, PDF, email

| File | Action | Why |
|---|---|---|
| `src/server/services/billing.ts` | (same) | `issueInvoice` (due date = issue date + `invoice_due_days`, stored; email), `settleInvoice` (reference + date, not in the future), `cancelInvoice` (reason), `invoicePdf` (super_admin any; hospital_admin own facility, never drafts; audited) |
| `src/server/integrations/pdf/invoice.ts` | created | invoice PDF (DRAFT / CANCELLED marked across the page) |
| `src/server/outbox/templates.ts` | changed | `invoice.issued` email |
| `src/app/api/invoices/[id]/pdf/route.ts` | created | PDF download |
| `src/app/(desk)/admin/finance/actions.ts`, `src/components/admin/invoice-actions.tsx` | created | Issue, Record payment, Cancel, PDF per invoice |
| `src/components/admin/invoices-ledger.tsx` | changed | actions column, monthly panel |
| `src/components/hospital/columns.tsx` | changed | invoice PDF link for hospital administrators |

The past-due alert already existed (Gate 2): "overdue" stays derived, never a status.

## 6.4 Exports

| File | Action | Why |
|---|---|---|
| `package.json`, `package-lock.json` | changed | added `exceljs` 4.4.0 (MIT) for XLSX |
| `src/server/integrations/xlsx.ts`, `src/server/integrations/pdf/table.ts` | created | XLSX (bold header, filter, frozen row) and landscape table PDF |
| `src/server/services/exports.ts` | created | reports `waste`, `certificates`, `invoices`, `audit` in the caller's scope (hospital roles: own facility in SQL); roles per report; audited `export.downloaded` |
| `src/app/api/export/[report]/route.ts` | created | `?format=xlsx|pdf` |
| `src/components/shared/export-links.tsx` | created | Excel / PDF buttons |
| hospital waste / certificates / invoices, admin finance, regulator overview / certificates / audit pages | changed | export buttons |

## 6.5 Regulator: audit chain check and evidence

| File | Action | Why |
|---|---|---|
| `src/server/services/audit-check.ts`, `src/app/(desk)/regulator/audit/actions.ts` | created | recompute the whole hash chain (EFDA officer, super_admin); read-only |
| `src/components/regulator/audit-chain-check.tsx` | created | "Verify the hash chain" → intact / broken at entry #n |
| `src/server/queries/regulator.ts`, `src/types/view-models/regulator.ts` | changed | `getRegulatorEvidence`: overrides with reasons; arrivals outside the geofence or without GPS (90 days) |
| `src/components/regulator/widgets.tsx` | changed | `EvidenceWidget` |
| `src/app/(desk)/regulator/audit/page.tsx` | changed | chain check, evidence, audit export above the ledger |

## Tests

| File | What |
|---|---|
| `tests/unit/billing.test.ts` | 8 tests: VAT and rounding, refusals, month periods (leap year), previous month, billable month, due dates, contract status |
| `tests/integration/billing.test.ts` | 6 tests: contract roles / validation / overlap / code; EXPIRING_SOON at creation, backwards renewal refused, daily job expires; monthly drafts (VAT copied, idempotent), hospital never sees drafts, issue (due date, email, 409 twice), other facility 404, settle (future date 422), cancel after settle 409, audit trail; cancel needs a reason; exports scope (XLSX read back), PDF, EFDA 403 on invoices, unknown report / format, audited; chain check + evidence for EFDA, 403 for hospitals |
| `tests/e2e/billing.spec.ts` | contract created in the UI → monthly job (401 without secret) → issue in the ledger; exports by role; daily job 401; chain check in the UI |

Billing fixtures use the year 2098 so the monthly run never bills the seeded demo contracts (2099 belongs to `tests/integration/codes.test.ts`, which resets its counters).

How to undo: restore the listed files from the pre-Gate-6 backup folder, delete the created files, and run
`npm uninstall exceljs`.
