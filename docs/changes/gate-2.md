# Change log — Gate 2 (database, workflow engine, backend services)

Started 9 Oct 2026. No git; this file replaces commit history for Gate 2. Secret values are never written here.
Build order (DECISION 8 Oct 2026, see `docs/build-plan.md`): role features and backend first, Clerk users last.

## 2.1 Full database schema — done 9 Oct 2026

ASSUMPTIONS approved with the plan ("go"): `vehicles.model` is optional; planned stop times are not stored.

| Task | File | Action | Why |
|---|---|---|---|
| 2.1 | `src/server/db/schema/_common.ts` | created | shared `id()` (UUID v7), `timestamps`, `tsz`, `filled()` helpers |
| 2.1 | `src/server/db/schema/enums.ts` | changed | all §5 enums + `outbox_channel`, `license_subject`; MOH colour codes |
| 2.1 | `src/server/db/schema/catalog.ts` | created | `waste_categories` (code, name, colour_code, active only — v1.2 addendum), `destruction_methods` |
| 2.1 | `src/server/db/schema/fleet.ts` | created | `vehicles`, `drivers`, `tracker_devices` (token hash), `licenses` |
| 2.1 | `src/server/db/schema/waste.ts` | created | `waste_records`, `containers` (code formats, count/weight, cancel and exception reasons) |
| 2.1 | `src/server/db/schema/trips.ts` | created | `trips` (one IN_PROGRESS per vehicle/driver), `trip_stops` (completion/override/skip checks), `trip_stop_waste` (one active stop per waste) |
| 2.1 | `src/server/db/schema/handover.ts` | created | `otp_codes` (hash only, one ISSUED per stop), `handovers` (one scan per container per stop) |
| 2.1 | `src/server/db/schema/tracking.ts` | created | `gps_events` (unique device + time, coordinate ranges) |
| 2.1 | `src/server/db/schema/disposal.ts` | created | `disposal_records` (locked needs destruction), `certificates` (one current per disposal; ISSUED/REVOKED fields) |
| 2.1 | `src/server/db/schema/billing.ts` | created | `contracts` (`CT-YYYY-NNNN`), `invoices` (total = subtotal + VAT, unique contract+period, `due_date` at ISSUED) |
| 2.1 | `src/server/db/schema/platform.ts` | created | `settings`, `audit_logs` (hash chain columns), `outbox_messages`, `idempotency_keys` (NULLS NOT DISTINCT) |
| 2.1 | `src/server/db/schema/index.ts` | changed | exports all modules |
| 2.1 | `drizzle/0003_gate2_full_schema.sql` | generated | 22 tables, 15 enums, all CHECKs and indexes |
| 2.1 | `drizzle/0004_gate2_triggers.sql` | created (custom) | audit log append-only; locked disposal guard; driver / operator role triggers; health-facility trigger; container code ↔ waste trigger; invoice ↔ contract facility; `contracts_no_overlap` (btree_gist EXCLUDE); `updated_at` triggers on 19 tables |
| 2.1 | `scripts/seed.ts` | changed | adds 6 categories, 5 destruction methods, 17 default settings (§7, insert-if-missing), 2 vehicles, driver profile for `dev_driver`; still idempotent |
| 2.1 | `tests/integration/schema-gate2.test.ts` | created | 17 tests: every rule above refused with its constraint name, plus seed/reference data check |

Applied to Neon branch `dev`: 5 migrations, 24 tables, 33 triggers. Migration 0004 was first dry-run inside a
rolled-back transaction (a PL/pgSQL `IF … CASE … THEN` parse issue was found and fixed before applying).

Checks (9 Oct 2026): typecheck ✔ · lint ✔ (0 warnings) · unit 56/56 ✔ · integration 27/27 ✔ · build ✔ · e2e 60/60 ✔.

### How to undo 2.1
1. Restore the folder backup made before Gate 2 (or delete the schema files listed above and restore
   `enums.ts` / `index.ts` / `scripts/seed.ts` from it).
2. Database: on the Neon `dev` branch, either reset the branch from `production` in the Neon console, or drop the
   Gate 2 tables/types/functions and delete the rows for 0003/0004 from `drizzle.__drizzle_migrations`.
   Migrations 0000–0002 (users, facilities) are not affected.

## 2.2 Database triggers — done with 2.1
Covered by `drizzle/0004_gate2_triggers.sql` (audit log append-only, locked disposal records) and its tests.

## 2.3–2.5 Code generators, settings, audit writer — done 9 Oct 2026

ASSUMPTIONS approved ("approved", 9 Oct 2026): counters restart per period as in the code formats (WR monthly,
TR daily, CD yearly, INV monthly, CT yearly) in EAT; a full period raises `CODE_SEQUENCE_EXHAUSTED` (409);
the concurrency tests commit rows on the Neon `dev` branch until a separate test branch exists.

| Task | File | Action | Why |
|---|---|---|---|
| 2.3 | `src/lib/codes.ts` | created | pure formatters / periods / patterns for WR, container, TR, CD, INV, CT |
| 2.3 | `src/server/db/codes.ts` | created | `nextCode(tx, kind, at)`: one atomic upsert per number, in the caller's transaction |
| 2.3 | `src/server/db/executor.ts` | created | `DbExecutor` type = `db` or a transaction |
| 2.3 | `src/server/db/schema/platform.ts` | changed | table `code_sequences`; `audit_logs.seq` (identity) + unique `prev_hash` (NULLS NOT DISTINCT) |
| 2.3/2.5 | `drizzle/0005_codes_and_audit_chain.sql` | generated + 1 trigger line | the schema change above; dry-run then applied to `dev` |
| 2.4 | `src/lib/validation/settings.ts` | created | zod schema + default per §7 key (single source; sanity ranges are ASSUMPTIONS) |
| 2.4 | `src/server/services/settings.ts` | created | `getSetting(key, tx?)`, typed; missing/invalid row → `SETTING_INVALID` (500), no silent fallback |
| 2.4 | `scripts/seed.ts` | changed | imports `DEFAULT_SETTINGS` from the shared file (no second copy) |
| 2.5 | `src/server/audit/hash.ts` | created | canonical JSON + SHA-256 chain hash; refuses secret keys (otp, token, password …) |
| 2.5 | `src/server/audit/writer.ts` | created | `writeAudit(tx, entry)`: savepoint + `pg_advisory_xact_lock`, reads last hash, inserts |
| 2.5 | `src/server/audit/verify.ts` | created | `verifyAuditChain()`: walks by `seq`, returns first broken row and reason |
| tests | `tests/stubs/server-only.ts`, `vitest.config.ts`, `vitest.integration.config.ts` | created / changed | lets tests import server modules (`server-only` throws outside Next) |
| tests | `tests/integration/db.ts` | changed | `drizzleOn`, `inCommittedTransaction`, `inRolledBackDrizzle` helpers |
| tests | `tests/unit/{codes,settings,audit-hash}.test.ts` | created | 14 tests |
| tests | `tests/integration/{codes,settings,audit-chain}.test.ts` | created | 13 tests: 50 concurrent codes distinct; 50 concurrent audit writes = valid chain; tamper/delete detected |
| tests | `tests/integration/schema-gate2.test.ts` | changed | 25 tables; raw audit insert uses a dummy `prev_hash` (first-entry rule) |

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 70/70 ✔ · integration 40/40 ✔ · build ✔ · e2e 60/60 ✔.
`format:check` lists 29 files that were already unformatted before this gate (docs, drizzle meta, mocks,
types) — none of the new files; not reformatted without approval.

Notes:
- The `dev` branch now holds 50+ permanent audit rows with `entity_type = 'test'` (audit rows cannot be deleted).
- All audited writes are serialised by the advisory lock until their transaction commits; fine at pilot scale.
  50 concurrent writes over the network took ~25 s in the test.

### How to undo 2.3–2.5
1. Delete the created files above; restore `platform.ts`, `seed.ts`, the vitest configs, `tests/integration/db.ts`
   and `schema-gate2.test.ts` from the folder backup.
2. Database: `DROP TABLE code_sequences;` `ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_prev_hash_unique;`
   `DROP INDEX audit_logs_seq_unique;` `ALTER TABLE audit_logs DROP COLUMN seq;` and delete the 0005 row from
   `drizzle.__drizzle_migrations` (or reset the `dev` branch in Neon).

## 2.6 Workflow Engine — done 9 Oct 2026

Approved 9 Oct 2026. Source: CLAUDE.md §5 + architecture §7.5 (who / reason) + Appendix C (roles).

| Task | File | Action | Why |
|---|---|---|---|
| 2.6 | `src/server/workflow/table.ts` | created | pure transition table for 12 entities: allowed moves, who may make them, reason column; `checkTransition()` (403 efda / wrong role / other facility, 409 INVALID_TRANSITION, 422 REASON_REQUIRED) |
| 2.6 | `src/server/workflow/guards.ts` | created | `Guard` interface, `ensure()`, `runGuards()` — services add their guards in Gates 3–6 |
| 2.6 | `src/server/workflow/engine.ts` | created | `transition(tx, …)`: lock row FOR UPDATE → check → guards → UPDATE (status + reason + time + extra fields) → `writeAudit`; `inWorkflow(fn)` = one transaction |
| 2.6 | `src/server/audit/hash.ts` | changed | secret-key check now also catches camelCase (`codeHash`, `tokenHash`) |
| tests | `tests/unit/workflow-table.test.ts` | created | 18 tests: every (from, to) pair of every entity vs. an independent copy of §5; final states have no exit; efda 403 on every move; roles; reasons; facility scope |
| tests | `tests/integration/workflow-engine.test.ts` | created | 7 tests: update + audit row; 409 leaves row and audit untouched; 403/422/404; guards; destroyed container locked; two concurrent requests → one wins, one 409, one audit row |

ASSUMPTIONS (please confirm):
- "system" moves (side effects such as container → COLLECTED on stop completion) may be triggered by any role
  except efda_officer, or by a background job; the calling service authorises the command itself.
- `RECEIVED → CLOSED_NO_DESTRUCTION` reason is kept in the audit log (no column; container reasons are stored).
- `ACTIVE → EXPIRED` allowed directly for contracts (short contract or missed job day).
- Facility, vehicle and driver statuses have no state machine in the architecture: any change allowed
  (facility: super_admin; vehicle/driver: super_admin or the trip workflow).
- `PENDING/FAILED → FAILED` on certificates is allowed (architecture §7.5 lists it for the retry job).

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 88/88 ✔ · integration 47/47 ✔ · build ✔ · e2e 60/60 ✔.
The concurrency test commits one waste record (deleted afterwards) and one audit row (permanent, `dev` branch).

### How to undo 2.6
Delete `src/server/workflow/` and the two test files; restore `src/server/audit/hash.ts` from the backup.
No database change.

## 2.7 Idempotency — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.7 | `src/lib/idempotency/key.ts` | created | `Idempotency-Key` header must be a UUID (architecture §9); 24 h TTL constant |
| 2.7 | `src/server/idempotency/store.ts` | created | `withIdempotency(tx, scope, run)`: key inserted in the action's transaction; concurrent duplicate waits and replays; same key + different body → 422 `IDEMPOTENCY_KEY_REUSED`; missing key → 400; `purgeExpiredIdempotencyKeys()` for the daily job |
| 2.7 | `src/server/db/schema/platform.ts`, `drizzle/0006_idempotency_request_hash.sql` | changed / generated | `idempotency_keys.request_hash` (SHA-256 of route + canonical request); dry-run, applied to `dev` |
| tests | `tests/unit/idempotency.test.ts`, `tests/integration/idempotency.test.ts` | created | 3 + 6 tests incl. 5 concurrent retries → action runs once, same response for all |
| tests | `tests/integration/schema-gate2.test.ts` | changed | raw insert now gives `request_hash` |

Note: a failed action stores nothing (it rolls back with the key), so a retry runs it again — errors are not replayed.

## 2.8 Outbox — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.8 | `src/server/outbox/enqueue.ts` | created | `enqueueMessage(tx, msg)`: validates template data + recipient, writes in the caller's transaction |
| 2.8 | `src/server/outbox/templates.ts` | created | `otp.pickup` (SMS) + `system.test_sms` / `system.test_email`; others come with their gates |
| 2.8 | `src/server/outbox/seal.ts` | created | AES-256-GCM for secrets (the OTP) while queued; removed once SENT/FAILED |
| 2.8 | `src/server/outbox/dispatcher.ts`, `retry.ts` | created | one message per transaction, `FOR UPDATE SKIP LOCKED`; retries 1/5/15/60 min; FAILED at `outbox_max_attempts` (+ error log → dashboard alert); expired messages never sent |
| 2.8 | `src/server/outbox/after-commit.ts` | created | dispatcher started right after a workflow commit that enqueued something (best effort) |
| 2.8 | `src/server/workflow/engine.ts` | changed | `inWorkflow` kicks the dispatcher after commit |
| 2.8 | `src/server/integrations/messaging.ts` | created | `SmsProvider` / `EmailProvider` interfaces + console providers (log masked recipient and length, never the text) |
| 2.8 | `src/server/jobs/cron-auth.ts` | created | `Authorization: Bearer <CRON_SECRET>`, constant-time compare |
| 2.8 | `src/app/api/jobs/outbox/route.ts` | created | `POST /api/jobs/outbox` → counts only |
| 2.8 | `src/lib/env-schema.ts`, `.env.example`, `.env.local` | changed | new required `OUTBOX_ENCRYPTION_KEY` (64 hex); generated locally, value never printed |
| tests | `tests/unit/outbox.test.ts`, `tests/integration/outbox.test.ts`, `tests/e2e/jobs.spec.ts` | created | 11 unit, 6 integration, 3 e2e |
| tests | `tests/unit/env.test.ts` | changed | new required variable |

ASSUMPTIONS (please confirm):
- The plain OTP must exist until the SMS is sent, so it is stored encrypted (new env var) and wiped afterwards.
- Outbox status is technical state of the outbox module: not via the Workflow Engine, not audited per send
  (logged instead); FAILED messages are the dashboard alert.
- SMS text is English until the client gives wording.

Checks (9 Oct 2026, after 2.7 + 2.8): typecheck ✔ · lint ✔ · unit 100/100 ✔ · integration 59/59 ✔ · build ✔ ·
e2e 63/63 ✔.

### How to undo 2.7–2.8
Delete the created files; restore `platform.ts`, `engine.ts`, `env-schema.ts`, `.env.example`, `env.test.ts`,
`schema-gate2.test.ts` from the backup; remove `OUTBOX_ENCRYPTION_KEY` from `.env.local`. Database:
`ALTER TABLE idempotency_keys DROP COLUMN request_hash;` and delete the 0006 row from `drizzle.__drizzle_migrations`.

## 2.9 Seed data — done 9 Oct 2026

Approved 9 Oct 2026 ("do the next"). Owner: Ethio Telecom SMS key will be bought later — console providers stay.

| Task | File | Action | Why |
|---|---|---|---|
| 2.9 | `scripts/seed.ts` | changed | all 18 prototype facilities (contacts dropped); 16 fictional facility users (+251 900 000 2xx); second driver `seed_driver_2`; runs `seed-operations.ts` once on a database without waste; `--dry-run` rolls the operational part back |
| 2.9 | `scripts/seed-operations.ts` | created | demo data relative to "now" (EAT): 9 trips (3 history, 3 completed covering OTP / in-app / override / skipped / no-GPS / outside geofence, 1 cancelled, 1 in progress today with the truck at the door of DD-REF-001, 1 planned tomorrow); 30 waste records in every status; disposal records; 16 certificates (ISSUED, PENDING, FAILED, REVOKED + reissued); licences (one expiring in 18 days); 2 tracker devices; 17 contracts (ACTIVE, 2 EXPIRING_SOON, 1 EXPIRED); 48 invoices over 3 months (settled, issued incl. overdue, draft, cancelled); 155 audit entries (request_id "seed") appended to the hash chain |
| 2.9 | `src/server/audit/hash.ts`, `writer.ts` | changed | `AUDIT_CHAIN_LOCK_KEY` moved to `hash.ts` (shared by writer and seed) |
| tests | `tests/integration/seed-data.test.ts` | created | 23 tests: every status value present; 2 facilities "not ready"; overdue waiting list; container count; container ↔ waste status; scheduled waste on open stops; picked-up waste from a completed stop of its own facility; NO PARTIAL PICKUP (a scan for every container of a completed stop); COMPLETED trip rule; ARRIVED stop has one ISSUED OTP; disposal/certificate consistency; invoice fee/VAT/due date; codes never ahead of counters; audit chain intact |
| tests | `tests/integration/schema-gate2.test.ts` | changed | creates its own facilities / vehicles / driver and uses far-future trip codes, so it no longer collides with seeded data |

Seeded on Neon `dev` (9 Oct 2026): 18 facilities, 22 users, 2 drivers, 30 waste records, 63 containers, 9 trips,
24 stops, 16 certificates, 17 contracts, 48 invoices. A second `npm run db:seed` skips the operational part.

ASSUMPTIONS (please confirm):
- Operational demo rows are inserted in their final state (fixtures), not replayed through the Workflow Engine;
  the database constraints and the invariant test guarantee they are valid.
- Issued demo certificates have a placeholder `file_key` / SHA-256 until PDF generation exists (Gate 5.3) — their
  download will not work until then.
- Monthly fees (fictional): referral 25,000 ETB, general 15,000, primary 8,000, clinic 4,500, pharmacy 3,000.
- Invoice numbers use the billing period's month (`INV-2026-09-…` for September).

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 100/100 ✔ · integration 83/83 ✔ · build ✔ · e2e 63/63 ✔.

### How to undo 2.9
Restore `scripts/seed.ts`, `hash.ts`, `writer.ts`, `schema-gate2.test.ts` from the backup; delete
`scripts/seed-operations.ts` and `tests/integration/seed-data.test.ts`. Database: reset the Neon `dev` branch
(audit rows cannot be deleted by design), then `npm run db:migrate && npm run db:seed` with the restored seed.

## 2.10 v1.2 statuses in the UI + prototype fields removed — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.10 | `src/lib/statuses.ts` | created | single source of every §5 status list + types; `STATUS_META` (text label + tone for every value); derived flags OVERDUE / NO_CONTRACT / NOT_READY / NO_GPS (shown like a badge, never stored) |
| 2.10 | `src/server/db/schema/enums.ts` | changed | pgEnums built from those lists (`db:generate`: no schema change) |
| 2.10 | `src/components/shared/status-badge.tsx` | rewritten | accepts only v1.2 values / derived flags (type error otherwise); always shows text; `data-status` attribute |
| 2.10 | `src/types/{waste,fleet,finance,disposal,facility}.ts` | changed | status unions re-exported from `src/lib/statuses.ts` (SEALED, PAID, OVERDUE, COLLECTED_OVERRIDE-as-waste, DESTROYED-as-waste … gone); dropped battery, barcode, seal number, temperature, emissions, witness, authorized contacts, monthly estimate, rate per kg, billed kg |
| 2.10 | `src/types/view-models/*.ts` | changed | every `@deprecated` field removed. New: `InvoiceRow.overdue` (derived), `AdminAlerts.facilitiesNotReady`, `HospitalFacility.otpRecipientCount`, `StopCard.arrivedAt` + `collectionMethod`, `DriverTrip.startedAt`, `QueueContainer.wasteCode`, `VerifyResult.wasteCode / categoryName / destroyedOn / destructionMethodName` |
| 2.10 | `src/mocks/**` | changed | mock data and mappers moved to v1.2 values (stop COLLECTED / ARRIVED / COLLECTED_OVERRIDE, waste DISPOSED / IN_TRANSIT, invoice SETTLED_OFFLINE, certificate numbers CD-YYYY-NNNNN); unknown verify token now returns null → 404 (prototype fallback removed) |
| 2.10 | `admin/alerts/page.tsx`, `admin/layout.tsx` | changed | "Facilities missing authorized contact" → "Facilities not ready for pickup" |
| 2.10 | `hospital-shell.tsx` | changed | "Authorized EHO" removed; "incomplete contact" banner → "Not ready for pickup" when no OTP recipient |
| 2.10 | `driver/stop-card.tsx`, `driver/upcoming/page.tsx` | changed | contact block and "Schedule & ETA" removed; arrival time (EAT) and how the handover was confirmed (OTP / in-app / override) shown |
| 2.10 | `disposal/columns.tsx`, `container-lists.tsx`, `disposal-header.tsx`, `disposal/inbound/page.tsx` | changed | barcode → Waste ID; per-container payload removed; "INCINERATOR STATUS: 1150°C" → "DISPOSAL SITE"; "sealed bins" → "containers"; times in EAT |
| 2.10 | `admin/contracts-table.tsx`, `admin/invoices-ledger.tsx` | changed | "Rate / Kg" and "Billed Volume" columns removed; status filter has v1.2 values + "Overdue"; overdue badge next to ISSUED |
| 2.10 | `shared/facility-map.tsx` | changed | stop pin colours keyed by v1.2 stop statuses; battery removed |
| 2.10 | `regulator/tables.tsx` | changed | audit action shown as plain text (an event name is not a status) |
| 2.10 | `verify/[token]/page.tsx`, `server/queries/verify.ts` | changed | DECISION fields only (Waste ID, category, destruction date + method, issue date); operator and witness removed; "EFDA" header / "revoked by EFDA audit" corrected (the certificate is issued by the operator, revoked by super_admin); unverified "SHA256 Cryptographic Match" claim removed |
| tests | `tests/unit/statuses.test.ts` | created | 17 tests: DB enums = shared lists; StatusBadge shows a readable label for every value of every entity; no prototype statuses left in `src` |

Note (not approved beforehand, reported): running Prettier on the edited folders also reformatted 11 previously
unformatted code files (`src/app/globals.css`, `src/mocks/data/*`, `src/mocks/driver.ts`, `src/types/*`) —
whitespace only. Docs, drizzle meta and scripts were not touched.

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 117/117 ✔ · integration 83/83 ✔ · build ✔ · e2e 63/63 ✔.

### How to undo 2.10
Restore the listed files from the backup; delete `src/lib/statuses.ts` and `tests/unit/statuses.test.ts`.
No database change.

## 2.11 /regulator on database queries — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.11 | `src/server/queries/regulator.ts` | rewritten | one query per widget, each starts with `requireRole("efda_officer")`: filter options, KPIs, weekly trend (8 EAT weeks, empty weeks included), facility volumes, audit page (cursor = seq), certificates page (cursor = certificate no.), map (IN_PROGRESS trips only; speed from the latest GPS point or null). SQL aggregates, `Promise.all`, LIMIT on every list, pages of 50 (max 100) |
| 2.11 | `src/types/view-models/regulator.ts` | changed | per-widget types; filters use the facility CODE; `AuditRow.seq`; `Page<T>`; old whole-dashboard type kept only for the unused mock |
| 2.11 | `src/types/view-models/shared.ts` | changed | `MapVehicle.speedKmh` nullable ("no GPS") |
| 2.11 | `src/components/regulator/widgets.tsx` | created | async Server Component per widget + "Older entries" links that keep the filters |
| 2.11 | `src/components/shared/skeleton.tsx` | created | `WidgetSkeleton`, `KpiRowSkeleton` |
| 2.11 | `src/components/regulator/regulator-scope.tsx` | changed | filter bar + KPIs in `<Suspense>` + tabs (tab counts dropped: they cost extra queries) |
| 2.11 | `src/app/(desk)/regulator/{page,audit/page,certificates/page,map/page}.tsx` | changed | each widget in its own `<Suspense>` with a skeleton, keyed by filters / cursor |
| 2.11 | `filters-kpis.tsx`, `tables.tsx`, `weekly-trend-chart.tsx`, `facility-map.tsx` | changed | facility code in the URL; audit time in EAT, "System job" for jobs; growth computed week over week (was a fixed "+14.2%"); KPI texts no longer claim "100% compliant with EFDA standards" / "Discrepancy investigated" |
| 2.11 | `src/mocks/regulator.ts`, `tests/unit/mocks.test.ts` | changed | the mock is now UNUSED (kept until 2.17 — deleting needs approval); patched to the new filter type |
| tests | `tests/integration/regulator-queries.test.ts` | created | 13 tests: every other role gets 403 from every regulator query; KPIs equal an independent SQL count; filters narrow; 8 labelled weeks; paging without gaps/overlaps; malformed cursor/filters ignored; map = today's trip, speed null |
| tests | `tests/e2e/routes.spec.ts` | changed | facility filter uses `DD-REF-001`; 2 new tests: certificates show CD- numbers from the database, audit ledger has real entries, map shows ET-3-A48291 |

Note: the audit ledger shows newest first, so rows written by integration tests (`test.*`) appear on top on the
`dev` branch — another reason for a separate Neon test branch.

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 117/117 ✔ · integration 96/96 ✔ · build ✔ · e2e 65/65 ✔.

### How to undo 2.11
Restore the listed files from the backup; delete `widgets.tsx`, `skeleton.tsx` and
`tests/integration/regulator-queries.test.ts`. No database change.

## 2.12 /hospital on database queries — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.12 | `src/server/queries/hospital.ts` | rewritten | one query per widget; every query takes the facility from the signed-in user's row and filters `WHERE facility_id = …` in SQL: facility (+ OTP-recipient count), KPIs (waiting / scheduled / in transit / disposed this EAT month), waste page, certificates page, invoices page and outstanding (hospital_admin only, never DRAFT; `overdue` derived on the EAT date). LIMIT everywhere, cursor paging by code |
| 2.12 | `src/types/view-models/hospital.ts` | changed | `HospitalKpis`; old whole-dashboard type kept only for the unused mock |
| 2.12 | `src/components/hospital/hospital-shell.tsx` | rewritten | server component (no client context): header, "not ready" warning, KPIs in `<Suspense>`, tabs (counts dropped) |
| 2.12 | `src/components/hospital/widgets.tsx` | created | async Server Component per widget + "Older …" links |
| 2.12 | `src/components/hospital/columns.tsx` | changed | data-only `WasteTable` / `CertificateTable` / `InvoiceTable` (column renderers cannot cross server → client); overdue badge; "—" for empty dates |
| 2.12 | `src/app/(desk)/hospital/{layout,page,waste/page,certificates/page,invoices/page}.tsx` | rewritten | server pages, one `<Suspense>` per widget; invoices page shows the "for administrators" message to staff (the query also refuses them) |
| 2.12 | `src/server/queries/_mock-bridge.ts` | changed | unused `mockFacilityIdFor` removed (the driver query still uses the file) |
| tests | `tests/integration/hospital-queries.test.ts` | created | 8 tests: other roles 403 everywhere; staff 403 on invoices; waste / certificates strictly own facility (no overlap with another facility); KPIs equal independent counts; no drafts; overdue rule; outstanding total; readiness of DD-CLI-017 vs DD-REF-001; paging |
| tests | `tests/e2e/routes.spec.ts` | changed | 2 new tests: admin sees DD-REF-001 waste codes and INV- numbers (no drafts); staff sees Sabian only |

"Truck at the door" (ARRIVED stop, polled every 10 s) and in-app confirmation stay in Gate 3.10 as planned.

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 117/117 ✔ · integration 104/104 ✔ · build ✔ · e2e 67/67 ✔.

### How to undo 2.12
Restore the listed files from the backup; delete `src/components/hospital/widgets.tsx` and
`tests/integration/hospital-queries.test.ts`. No database change.

## 2.13 /admin on database queries — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.13 | `src/server/queries/_shared.ts` | created | helpers shared by the area queries (no access checks): `rows`, paging limits, MoH colours, invoice SELECT + `toInvoiceRow` (derived overdue), `loadActiveTripMap` |
| 2.13 | `src/server/queries/admin.ts` | rewritten | `requireRole("super_admin")` in every query: KPIs, today's trips (+ any in progress), map, 30-day category volume, invoices page (drafts included), contracts + facilities without contract, alerts. Thresholds from settings (`overdue_pickup_days`, `tracker_silent_minutes`, `license_expiry_warning_days`) |
| 2.13 | `src/server/queries/{regulator,hospital}.ts` | changed | use the shared map / invoice helpers (no duplicate SQL) |
| 2.13 | `src/types/view-models/admin.ts` | changed | `AdminAlerts` adds overdue pickups, silent trackers, failed messages, invoices past due, expiring licences; KPIs add trips in progress + overdue threshold; `CategoryVolume` |
| 2.13 | `src/components/admin/{admin-header,widgets,alerts}.tsx` | rewritten / created | page header + KPI grid (fixed texts "+8% this week", "2 Active Drivers", "> 3 days" replaced by real values); one async widget per section; every alert section always shown with a "None — …" message |
| 2.13 | `contracts-table.tsx`, `invoices-ledger.tsx`, `category-chart.tsx` | changed | explicit props; "Ended" for past contracts; v1.2 wording (settled offline, not issued yet) |
| 2.13 | `src/app/(desk)/admin/**` | rewritten | layout: header + KPIs in `<Suspense>` + tabs (counts dropped); every page one `<Suspense>` per widget; "REFRESH: 30S" claim removed (no live GPS until Gate 4) |
| 2.13 | `src/mocks/admin.ts` | changed | UNUSED now; patched to the new types (kept until 2.17) |
| tests | `tests/integration/admin-queries.test.ts` | created | 7 tests: other roles 403 everywhere; KPIs = independent counts; today's live trip totals (3 stops, 1 done, 8 containers); categories; invoice paging incl. drafts; contracts + DD-CLI-009 without contract; every alert matches the seeded scenario |
| tests | `tests/unit/mocks.test.ts` | changed | `_*.ts` helpers exempt from the per-file role check, plus a new test that no page/component imports them |
| tests | `tests/e2e/routes.spec.ts` | changed | admin overview shows a TR- trip and ET-3-A48291; alerts show "not ready" and the silent tracker |

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 118/118 ✔ · integration 111/111 ✔ · build ✔ · e2e 68/68 ✔.

### How to undo 2.13
Restore the listed files from the backup; delete `_shared.ts`, `admin/widgets.tsx`, `admin/alerts.tsx` and
`tests/integration/admin-queries.test.ts`. No database change.

## 2.14 /driver and /disposal on database queries — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.14 | `src/server/queries/driver.ts` | rewritten | `requireRole("driver")`; profile by `drivers.user_id = session user`; only that driver's IN_PROGRESS / PLANNED trips; stops with expected containers, kg, categories, arrival time and collection method — 3 queries total (no N+1); no profile → null |
| 2.14 | `src/server/queries/disposal.ts` | rewritten | `requireRole("disposal_operator")` + the user's facility must be the DISPOSAL_SITE (else 403); stats (inbound, queue, destroyed today in EAT, missing / refused in 30 days), inbound trips with collected containers on board, queue (RECEIVED, oldest first), exceptions — LIMIT 100 each |
| 2.14 | `src/types/view-models/disposal.ts`, `disposal-header.tsx` | changed | site name from the database (was a fixed plant name); "Needs follow-up" only when there are exceptions (was always "Discrepancy logged") |
| 2.14 | `container-lists.tsx`, `columns.tsx` | changed | exception dates in EAT |
| 2.14 | `src/app/(mobile)/driver/page.tsx` | changed | progress bar safe for a trip with 0 stops |
| 2.14 | `src/mocks/{driver,disposal,hospital}.ts` | changed | marked UNUSED (kept until 2.17) |
| tests | `tests/integration/driver-disposal-queries.test.ts` | created | 6 tests: other roles 403; dev driver sees today's 3 stops in order (1 done, 5 containers at the ARRIVED stop) and not the other driver's trip; second driver sees only tomorrow's trip; driver without profile → null; operator not linked to the site → 403; queue / inbound / exceptions equal the database |
| tests | `tests/e2e/routes.spec.ts` | changed | driver sees the trip and the arrived stop; operator sees container codes and the inbound truck |

ASSUMPTION: one disposal site (pilot scale) — all trips deliver to it, so the disposal queries are not filtered
by site beyond requiring the operator to belong to the DISPOSAL_SITE.

`src/server/queries/_mock-bridge.ts` has no users any more → listed below for deletion (needs approval).

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 118/118 ✔ · integration 117/117 ✔ · build ✔ · e2e 70/70 ✔.

### How to undo 2.14
Restore the listed files from the backup; delete `tests/integration/driver-disposal-queries.test.ts`.
No database change.

## 2.15 Waste registration — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.15 | `package.json`, `package-lock.json` | changed | `react-hook-form@7.54.2`, `@hookform/resolvers@3.9.1` (form stack of CLAUDE.md §2) |
| 2.15 | `src/lib/validation/waste.ts` | created | shared zod schema: category, `container_count >= 1`, `weight_kg > 0` (2 decimals); sanity maxima 100 containers / 10 000 kg (ASSUMPTION) |
| 2.15 | `src/server/services/waste.ts` | created | `registerWaste`: role check → facility from the session user (never the input) → zod → idempotency → one transaction: `nextCode("waste")`, waste REGISTERED, every container LABELLED (`…-C01…`), audit `waste.registered`. Refuses DISPOSAL_SITE / non-ACTIVE facilities and unknown / inactive categories |
| 2.15 | `src/app/(desk)/hospital/waste/new/{page,actions}.tsx` | created | the page and the Server Action (translates AppErrors to field errors; unexpected errors logged with a request ID, generic message to the user) |
| 2.15 | `src/components/hospital/register-waste-form.tsx` | created | react-hook-form + the same zod schema; one idempotency key per filled form (double click = one record); success view lists the Waste ID and every container code |
| 2.15 | `src/components/hospital/widgets.tsx` | changed | "Register waste" button on the overview and the waste list |
| 2.15 | `src/server/queries/hospital.ts` | changed | `getHospitalCategories`; local helper copies replaced by `_shared.ts` |
| 2.15 | `src/server/queries/regulator.ts` | changed | local helper copies replaced by `_shared.ts` |
| tests | `tests/unit/waste-validation.test.ts` | created | 5 tests (required category, count / weight limits, client facility ignored) |
| tests | `tests/integration/waste-registration.test.ts` | created | 7 tests: every non-hospital role 403 before any write (also inside the transaction); waste at the user's own facility, all containers LABELLED, audit row with request ID; 422 with field errors and nothing written; unknown / inactive category; suspended facility 409; double submit → one record, same Waste ID |
| tests | `tests/e2e/routes.spec.ts` | changed | form errors on an empty submit; a valid registration shows the Waste ID and 2 container codes; EFDA cannot open the page |
| tests | `workflow-engine.test.ts`, `audit-chain.test.ts` | changed | removes `WR-9901-…` leftovers of an interrupted run before starting; the 50-writer audit test gets a 180 s timeout (it took > 30 s on the network and its late writes disturbed the next test) |

Incident (9 Oct 2026): a full test run was stopped after > 10 minutes. It left one test record (`WR-9901-34987`,
no containers or links), which the race test normally deletes itself; it was removed with the same condition the
test uses. Cause and fix above.

Note: each e2e run now commits one real waste record (SHARPS, 2 containers) at DD-GEN-002 on the database the dev
server uses — a separate Neon test branch would keep the demo data clean.

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 123/123 ✔ · integration 124/124 ✔ · build ✔ · e2e 72/72 ✔.

### How to undo 2.15
`npm uninstall react-hook-form @hookform/resolvers`; delete the created files; restore the changed files from the
backup. No migration.

## Approved deletions — done 9 Oct 2026

Owner approved ("yes you can"). Each file was checked first: nothing imported it except the mock unit tests.

| File | Action | Why |
|---|---|---|
| `src/components/dev/dev-session-gate.tsx`, `src/components/dev/dev-role-switcher.tsx` | deleted | unused since R1 (test login) |
| `src/server/queries/_mock-bridge.ts` | deleted | unused since 2.14 |
| `src/mocks/{admin,hospital,driver,disposal,regulator}.ts` | deleted | pages read the database since 2.11–2.14 |
| `tests/unit/mocks.test.ts` | changed | per-area mock tests removed (covered by `tests/integration/*-queries.test.ts`); isolation checks kept |

How to undo: restore the files from the backup.

## 2.16 Container labels PDF — done 9 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 2.16 | `package.json`, `package-lock.json` | changed | `pdf-lib@1.17.1`, `qrcode@1.5.4`, dev `@types/qrcode@1.5.5` |
| 2.16 | `src/server/integrations/pdf/labels.ts` | created | `PdfRenderer` adapter: A4, 2 × 4 labels; category colour bar WITH its name; facility, "Container x of n", Waste ID, registration date; QR = container code only; code also printed in full; characters the standard fonts cannot draw become "?" instead of failing |
| 2.16 | `src/server/services/labels.ts` | created | role check (hospital roles own facility, super_admin any — Appendix C) → load scoped in SQL (other facility = 404, no existence leak) → only REGISTERED / SCHEDULED (cancelled → 409 labels invalid; collected → 409) → render outside any transaction → audit `labels.printed`, then `labels.reprinted` (same codes, print number in the audit) |
| 2.16 | `src/app/api/waste/[id]/labels/route.ts` | created | `GET` → `application/pdf`, `no-store`, request ID header; errors as `{ error }` JSON |
| 2.16 | `register-waste-form.tsx`, `hospital/columns.tsx` | changed | "Print labels (PDF)" after registration; "Print labels" link per printable row; registration date in EAT |
| tests | `tests/unit/labels-pdf.test.ts` | created | 3 tests: valid PDF, 8 per A4 page (1 / 8 / 9 / 17 labels), QR payload = container code, Ethiopic / very long names never break the sheet |
| tests | `tests/integration/labels.test.ts` | created | 5 tests: own facility + super_admin OK, other facility 404, other roles 403; cancelled / collected 409; printed → reprinted with identical codes; EFDA 403 at the entry point; Amharic switched on → 501 |
| tests | `tests/e2e/routes.spec.ts` | changed | the registration flow now downloads the real PDF; another facility's admin gets 404 |

Amharic labels (`label_amharic_enabled`): NOT built — needs the client's Amharic wording and the Noto Sans Ethiopic
font file. While the setting is off (default) nothing changes; if it is switched on, the route answers 501 with a
clear message instead of silently printing English.

Visual check: the layout was verified by measurements only (no PDF viewer available on this machine) — please open
one label sheet and confirm it prints well on your printer.

Checks (9 Oct 2026): typecheck ✔ · lint ✔ · unit 121/121 ✔ · integration 129/129 ✔ · build ✔ · e2e 72/72 ✔.

### How to undo 2.16
`npm uninstall pdf-lib qrcode @types/qrcode`; delete the created files; restore the changed files from the backup.

## Neon test branch — done 9–10 Oct 2026

Owner approved ("you can create that").

| Step | Where / file | What |
|---|---|---|
| T1 | Neon console | branch **test** created from `dev` (data + schema), auto-delete **Never**, endpoint `ep-sweet-cherry-b1njcm74` |
| T2 | `.env.test.local` (git-ignored) | `DATABASE_URL` / `DATABASE_URL_UNPOOLED` for `test` — built from the dev URLs by swapping only the endpoint (a child branch keeps its parent's role password); values never displayed. Verified: both connect, same data as `dev` |
| T3 | `tests/test-database.ts` | created: loads `.env.test.local` and REFUSES to run when it is missing, inconsistent, or points at the `dev` endpoint |
| T4 | `tests/integration/setup-env.ts`, `vitest.integration.config.ts` | integration tests use the `test` branch |
| T5 | `playwright.config.ts` | the e2e dev server (port 3100) gets the `test` branch URLs (env vars win over .env files) |
| T6 | `docs/test-users.md` | clarified that the Clerk table is for later; the dashboard test logins already work |

Verified 10 Oct 2026: after the integration run, `dev` was unchanged (32 waste records, 1 007 audit entries);
`test` received the test writes (1 058 audit entries).

How to undo: restore the changed files; delete `tests/test-database.ts` and `.env.test.local`; delete the branch in
the Neon console (Branches → test → Delete).

Note (10 Oct 2026): the overnight e2e run failed 43 / 72 with WebSocket errors to Neon while my separate connection
check failed the same way — a network / Neon outage, not a code fault. The connection works again (slowly: 5–8 s
per new connection).

## Fix: dropped Neon connections were never retried — 10 Oct 2026

Found while the network was dropping ~20–30 % of new connections (both `dev` and `test`, measured with a 10-connection
burst). A dropped Neon WebSocket surfaces as `Error("Failed query …", { cause: ErrorEvent })`. `ErrorEvent` is not an
`Error` and has no message, so `isTransientDbError` saw "[object ErrorEvent]" and did NOT retry; the dashboard
queries did not use the retry at all.

| File | Action | Why |
|---|---|---|
| `src/server/db/retry.ts` | changed | causes are described including non-Error objects (constructor name, `type`, `message`); `ErrorEvent` counts as a network failure |
| `src/server/queries/_shared.ts` | changed | `rows()` (every read-only dashboard query) runs through `withDbRetry` (3 attempts, 300 ms / 900 ms); writes are still never retried (idempotency protects them) |
| `tests/unit/db-retry.test.ts` | changed | a dropped WebSocket (`ErrorEvent` cause) is retried; a SQL error is not |

Effect on the same slow network: e2e 29/72 before → 71/72 after (the remaining one, `/admin/finance`, timed out
while compiling for the first time and passes on its own).

Checks (10 Oct 2026, unstable network): typecheck ✔ · lint ✔ · unit 122/122 ✔ · build ✔ · e2e 71/72 (+1 passes on
rerun) · integration 126/129 — the 3 failures are 30 s timeouts of the 50-parallel-transaction tests while
connections were being dropped; the same 129 passed earlier the same day on the `test` branch. `dev` unchanged
(32 waste records, 1 007 audit entries) after all runs.

How to undo: restore the three files from the backup.

## 2.17 Prototype mocks removed — done 10 Oct 2026

Owner approved ("okay continue" to the listed deletions). Each file was checked first.

| Task | File | Action | Why |
|---|---|---|---|
| 2.17 | `src/mocks/**` (`mappers.ts`, `verify.ts`, `data/` × 9) | deleted | nothing reads mock data any more |
| 2.17 | `src/types/audit.ts` | deleted | prototype-only (`AuditLog`, `AuditAction`, `SystemSettings`), used by mocks only |
| 2.17 | `src/types/{waste,fleet,finance,disposal,facility,auth,index}.ts` | changed | prototype domain shapes removed (`WasteRecord`, `WasteContainer`, `Vehicle`, `Driver`, `Trip`, `TripStop`, `Invoice`, `Contract`, `DisposalCertificate`, `DestructionRecord`, `Facility`, `UserProfile`…); kept: status re-exports, `MohColor`, category / facility-type / destruction-method codes, roles |
| 2.17 | `src/types/view-models/{admin,hospital,regulator,shared}.ts` | changed | deprecated whole-dashboard types removed; unused imports trimmed |
| 2.17 | `src/server/queries/verify.ts` | rewritten | `/verify/[token]` reads the database (the read part of Gate 5.4, needed to drop the last mock): only ISSUED / REVOKED are public; PENDING / FAILED / unknown / malformed → not found |
| 2.17 | `src/types/view-models/verify.ts`, `verify/[token]/page.tsx` | changed | EXACTLY the DECISION fields; the free-text revoke reason and the disposal-site name are no longer shown (not in the DECISION list); revoked page says "no longer valid" |
| tests | `tests/integration/verify-query.test.ts` | created | 3 tests: field list is exactly the DECISION list; REVOKED public; PENDING / FAILED / unknown / malformed → null |
| tests | `tests/unit/mocks.test.ts`, `tests/unit/statuses.test.ts` | changed | `src/mocks` must not exist and nothing may import it; status scan no longer reads `src/mocks` |
| tests | `tests/e2e/routes.spec.ts` | changed | verify tests use real tokens from the test database; issued shows the fields (no site name), revoked says so without the reason; pending / failed / unknown → 404 |

Still for Gate 5.4: PDF upload to compare the SHA-256, rate limiting of `/verify` and `/api/verify/*`.

Checks (10 Oct 2026, on the `test` branch): typecheck ✔ · lint ✔ · unit 122/122 ✔ · integration 132/132 ✔ · build ✔ ·
e2e 74/74 ✔.

**Gate 2 complete (2.1–2.17).**

How to undo: restore the deleted and changed files from the backup.

## Pending approvals carried over

None — every file listed for deletion has been removed with approval.

Other open items: Prettier on the remaining unformatted docs / drizzle meta / scripts.
