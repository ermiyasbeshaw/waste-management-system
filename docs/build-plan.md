# Build Plan — Neba CS / SafeWaste

Date: 7 Oct 2026. Based on `docs/frontend-audit.md`, `CLAUDE.md` and `docs/architecture-v1.2.pdf` (Appendix D gates).
The plan **reuses the existing UI**: dashboards are split into routes, then fed by server queries, then given actions.
Each task fits one Claude Code session and ends with `npm run typecheck && npm run lint && npm run test && npm run build`.
Stop for review after every task.

Conventions: Q = read query in `src/server/queries/`, S = service in `src/server/services/`, WE = Workflow Engine.
"Tests" lists the tests to write in that task. From G2 on, every write service gets an `efda_officer → 403` test.

## Before each gate (owner: you)

| ID | Task | Done when |
|---|---|---|
| P0.1 | ~~git init~~ — **dropped (decision 7 Oct 2026: no git).** Make a backup copy of the project folder before each gate; each gate keeps `docs/changes/<gate>.md` | Backup folder exists |
| P0.2 | ~~Install pnpm~~ — **dropped (decision: npm stays, keep `package-lock.json`)** | — |
| P0.3 | Answer the open questions at the end of `frontend-audit.md` | Done 7 Oct 2026 |

---

## Gate 1a — Route restructure (no behaviour change, mock data stays) — ✅ DONE 7 Oct 2026 (see `docs/changes/gate-1a.md`)

Approved order: 1a.0 → 1a.1 → 1a.2 → 1a.3 → 1a.8 → 1a.4 → 1a.5 → 1a.6 → 1a.7 → 1a.9.
Production builds without the dev switcher: `/` → `/sign-in` placeholder ("Sign-in arrives in Gate 1b"); pages that need a
user show "No session"; dashboards are viewable only in development. Prototype-only display fields are kept as optional
`@deprecated` view-model fields and listed in `docs/changes/gate-1a.md` under "To remove in Gate 2".

| ID | Gate | Task | Files to create/change | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 1a.0 | 1a | Record the review decisions (npm, no git, ESLint Strict, prototype fields, contract code, due date) | `CLAUDE.md`, `docs/build-plan.md`, `docs/frontend-audit.md`, `docs/changes/gate-1a.md` | — | — | Docs updated |
| 1a.1 | 1a | Tooling: ESLint Strict (`.eslintrc.json`: `next/core-web-vitals` + `next/typescript`), Prettier config, Vitest + `test` script | `package.json`, `package-lock.json`, `.eslintrc.json`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts` | 1a.0 | `tests/unit/roles.test.ts` | `npm run lint` runs non-interactively; all 4 checks green |
| 1a.2 | 1a | Dev-only role switcher: provider + switcher → `src/components/dev/`; switcher only when `NODE_ENV === "development"`; area guard placeholder; delete unused `src/server/auth/types.ts` | `src/components/dev/*`, `src/server/auth/area-guard.ts`, imports | 1a.1 | — | Same in dev; no switcher in production |
| 1a.3 | 1a | Route groups `(desk)` (sidebar shell), `(mobile)` (driver, disposal), `(public)` (sign-in, verify); one `layout.tsx` per area calling the guard placeholder; `/finance` → `redirect("/admin/finance")` | `src/app/**/layout.tsx`, moves | 1a.2 | — | URLs unchanged; public pages without sidebar |
| 1a.8 | 1a | Mock isolation: `src/mock` → `src/mocks/data`; per-area `get<Area>DashboardMock()` returning `src/types/view-models/*`; `src/lib/money.ts`; no hard-coded driver ID / `fac-01` fallback | `src/mocks/**`, `src/types/view-models/*`, `src/lib/money.ts`, pages | 1a.3 | `tests/unit/money.test.ts`, mock view-model tests | No page imports `src/mocks/data` directly |
| 1a.4 | 1a | Split `/admin` tabs into sub-routes (`admin`, `fleet`, `finance`, `contracts`, `categories`, `alerts`); components → `src/components/admin/` | `src/app/(desk)/admin/**`, `src/components/admin/*` | 1a.8 | — | Every former tab is its own URL, same visuals |
| 1a.5 | 1a | Same split for `/hospital` (`waste`, `certificates`, `invoices`) and `/regulator` (`audit`, `certificates`, `map`); regulator filters in URL params | `src/app/(desk)/hospital/**`, `src/app/(desk)/regulator/**`, components | 1a.4 | — | `/regulator/audit` exists |
| 1a.6 | 1a | Mobile-first `/driver` (`upcoming`) and `/disposal` (`inbound`, `exceptions`): single column, bottom nav, targets ≥ 48 px | `src/app/(mobile)/**`, `src/components/{mobile,driver,disposal}/*` | 1a.5 | — | Usable at 360 px, no horizontal scroll |
| 1a.7 | 1a | Sidebar links → sub-routes; hide dead header buttons and "System Settings"; sign-out dev-only | `sidebar.tsx`, `header.tsx` | 1a.6 | — | No buttons without behaviour |
| 1a.9 | 1a | Playwright set-up + route smoke per dev role + 360 px check | `playwright.config.ts`, `tests/e2e/routes.spec.ts`, `test:e2e` | 1a.7 | e2e | `npm run test:e2e` green |

## Build order change (DECISION, owner, 8 Oct 2026)

Role features and backend first, Clerk users last:
1. **R0 — dev login without Clerk** ✅ done 8 Oct 2026 (dev role switcher → seeded `dev_<role>` users; real server-side guards).
2. Gate 1b tasks still open but **postponed to the end**: 1b.5 Clerk → users lookup in production use, 1b.7 `user:assign`
   for real accounts, 1b.8 Clerk webhook + phone verification, 1b.9 health + check script (1b.9 may be done earlier).
3. Then Gate 2 → Gate 6 in order, building every button on the real guards (`requireRole`, `requireFacilityScope`).
4. Last: create Clerk users, connect them to `users` rows, turn the dev bypass off (remove `.env.development.local`).

## Gate 1b — Foundation — 🟡 code done (1b.7 user:assign, 1b.8 webhook, 1b.9 health + check on 10 Oct 2026); Clerk users / dashboard setup by the owner, last (see `docs/changes/gate-1b.md`)

| ID | Gate | Task | Files to create/change | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 1b.1 | 1b | Strict env validation (no secret defaults); add `DATABASE_URL(_UNPOOLED)`, `CLERK_WEBHOOK_SECRET`, `APP_BASE_URL`, provider selectors; update `.env.example` | `src/env.ts`, `.env.example` | 1a.8 | unit: env schema rejects missing secrets | Build fails clearly if a required var is missing |
| 1b.2 | 1b | Shared libs: `AppError` + error handler, `src/lib/dates.ts` (EAT), extend `src/lib/money.ts` (created in 1a.8), request ID, JSON logger with phone masking | `src/server/errors.ts`, `src/lib/dates.ts`, `src/lib/money.ts`, `src/server/log.ts` | 1b.1 | unit: money rounding/VAT, EAT month boundaries, phone mask | Tests green |
| 1b.3 | 1b | Neon + Drizzle setup, drizzle-kit config, `db:generate`, `db:migrate`; `users` table + `user_role` enum + facility CHECK (hospital roles + disposal_operator) — minimal `facilities` table for the FK | `drizzle.config.ts`, `src/server/db/{client,schema/users,schema/facilities}.ts`, `drizzle/0000_*.sql` | 1b.1 | integration: CHECK rejects facility_id on driver, requires it on hospital roles | Migration applies to a Neon dev branch |
| 1b.4 | 1b | Clerk: `<ClerkProvider>` in root layout, `middleware.ts` (public routes per CLAUDE.md §3), `(public)/sign-in` with `<SignIn/>` | `middleware.ts`, `src/app/layout.tsx`, `src/app/(public)/sign-in/**` | 1b.3 | e2e: anonymous user redirected to `/sign-in` from `/admin` | Real sign-in works with a test Clerk instance |
| 1b.5 | 1b | Real `getCurrentUser()` (Clerk id → `users` row, React `cache`), `requireRole`, `requireFacilityScope` (throw `AppError` 403); `/pending` for no row / no role / inactive; `/` server redirect by role | `src/server/auth/current-user.ts`, `src/app/page.tsx`, `src/app/pending/page.tsx` | 1b.4 | unit: guards; integration: inactive → pending | Signed-in user without a row lands on `/pending` |
| 1b.6 | 1b | Area layouts call `requireRole` (admin, hospital, driver, disposal, regulator); hospital invoice pages require `hospital_admin` | `src/app/(app)/*/layout.tsx` | 1b.5 | permission e2e: each role × each area → allowed or redirect | 6 × 5 matrix passes |
| 1b.7 | 1b | `npm run user:assign` CLI and seeded test users per role; dev switcher becomes "sign in as test user" helper | `scripts/user-assign.ts`, `src/components/dev/*` | 1b.6 | — | One command gives a Clerk user any role |
| 1b.8 | 1b | Clerk webhook (`POST /api/webhooks/clerk`) syncing email, phone, `phone_verified`; **test +251 phone verification** | `src/app/api/webhooks/clerk/route.ts`, `src/server/services/users.ts` | 1b.5 | integration: signature check, upsert | Result of the +251 test recorded in `docs/` |
| 1b.9 | 1b | `GET /api/health` + `npm run check` script (lint → typecheck → test → build); a CI workflow is added only if the project ever moves to a git host | `src/app/api/health/route.ts`, `package.json` | 1b.3 | unit/integration: health returns no data | `npm run check` green |

## Gate 2 — Core data and workflow — ✅ DONE 10 Oct 2026 (see `docs/changes/gate-2.md`)

| ID | Gate | Task | Files to create/change | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 2.1 | 2 | Full schema per §6.2 + CLAUDE.md §5 enums (incl. SCHEDULED, SCANNED_AT_PICKUP, CLOSED_NO_DESTRUCTION, SETTLED_OFFLINE, collection_method, handover_status), UUID v7, `ON DELETE RESTRICT`, CHECKs, indexes §6.3, unique constraints, partial unique "one active trip per vehicle/driver"; v1.2 addendum fields: facility `city`/`sub_city`/`woreda`/`kebele` (nullable), `contracts.contract_code` (`CT-YYYY-NNNN`), `invoices.due_date`; NOT the dropped prototype fields | `src/server/db/schema/*.ts`, migration | 1b.9 | integration: each CHECK/unique constraint rejects bad rows | Migration applies cleanly from zero |
| 2.2 | 2 | DB triggers: `audit_logs` INSERT-only; `disposal_records.locked` cannot be updated | migration SQL | 2.1 | integration: UPDATE/DELETE raise | Tests green |
| 2.3 | 2 | Human code generators (WR, container, TR, CD, INV, CT) with per-period sequences, never reused | `src/server/db/codes.ts` | 2.1 | unit: formats; integration: concurrency no duplicates | Tests green |
| 2.4 | 2 | Settings: table seed with all CLAUDE.md §7 defaults + `getSetting(key)` typed | `src/server/services/settings.ts` | 2.1 | unit: typed parsing; integration: default rows | `getSetting('otp_expiry_minutes') === 10` |
| 2.5 | 2 | Audit writer with hash chain + advisory-lock serialisation, `verifyAuditChain()` | `src/server/audit/*` | 2.2 | integration: 50 concurrent inserts → valid chain; tampered row detected | Tests green |
| 2.6 | 2 | Workflow Engine: transition table for every entity (CLAUDE.md §5), guards interface, `transition()` = check + guard + update + audit in one transaction | `src/server/workflow/{table,engine,guards}.ts` | 2.5 | unit: every allowed move passes, every other move → 409 INVALID_TRANSITION | 100% of table covered |
| 2.7 | 2 | Idempotency helper (checked + stored in the same transaction; 24 h replay) | `src/lib/idempotency/*`, `src/server/db/schema/idempotency.ts` | 2.6 | integration: two concurrent identical requests → one effect, same response | Tests green |
| 2.8 | 2 | Outbox: `enqueue(msg, tx)`, dispatcher, backoff 1/5/15/60, FAILED + alert; console SMS/email adapters; `POST /api/jobs/outbox` (CRON_SECRET) | `src/server/outbox/*`, `src/server/integrations/{sms,email}/*`, `src/app/api/jobs/outbox/route.ts` | 2.6 | integration: rollback → no message; retry schedule; expired OTP not retried | Tests green |
| 2.9 | 2 | Seed data shaped like the current mocks but v1.2-valid (18 facilities, users per role with fictional phones, 2 vehicles, trips in each state, waste in each status, contracts, invoices) | `scripts/seed.ts`, `db:seed` | 2.3–2.8 | integration: seed satisfies all invariants (container count, statuses) | `npm run db:seed` on empty DB |
| 2.10 | 2 | View-model types already exist (Gate 1a.8): remove the `@deprecated` prototype fields listed in `docs/changes/gate-1a.md`; migrate `StatusBadge` + `src/types` to v1.2 statuses (remove SEALED, PAID, OVERDUE…) | `src/types/**`, `status-badge.tsx`, mocks adjusted to compile | 2.1 | unit: StatusBadge renders every v1.2 enum value with text | Typecheck green |
| 2.11 | 2 | Replace mock → server queries: **/regulator** (read-only, simplest; one Suspense per widget) | `src/server/queries/regulator.ts`, regulator pages + skeletons | 2.9, 2.10 | integration: queries; permission: only efda/super_admin | No `@/mock` import under `regulator/` |
| 2.12 | 2 | Same for **/hospital** (facility scope in SQL) | `src/server/queries/hospital.ts`, hospital pages | 2.11 | facility-scope tests: user of A cannot read B (also by URL id) | No `@/mock` under `hospital/` |
| 2.13 | 2 | Same for **/admin** (overview, finance, contracts, categories, alerts incl. "facility not ready") | `src/server/queries/admin.ts`, admin pages | 2.11 | integration | No `@/mock` under `admin/` |
| 2.14 | 2 | Same for **/driver** and **/disposal** (read only) | `src/server/queries/{driver,disposal}.ts`, pages | 2.11 | integration: driver sees only own trips | No `@/mock` import left in `src/app` |
| 2.15 | 2 | Waste registration (S `registerWaste`, form with react-hook-form + zod, containers LABELLED) and cancel (S `cancelWaste`, blocked while stop ARRIVED) | `src/server/services/waste.ts`, `src/lib/validation/waste.ts`, `src/components/hospital/register-waste-form.tsx` | 2.12 | integration + permission (efda 403, other facility 403) | Hospital user registers waste end-to-end |
| 2.16 | 2 | Labels PDF (QR = container code, x of n, Amharic setting) `GET /api/waste/{id}/labels`; `PdfRenderer` adapter | `src/server/integrations/pdf/*`, `src/app/api/waste/[id]/labels/route.ts` | 2.15 | integration: scope, reprint audited | PDF downloads |
| 2.17 | 2 | Delete `src/mock/` and dev-only mock provider remnants | `src/mock/**` | 2.14 | full suite | Gate 2 review |

## Gate 3 — Pickup — ✅ DONE 10 Oct 2026 (see `docs/changes/gate-3.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 3.1 | 3 | Admin facilities + users management, OTP-recipient flag, "facility not ready" | S `facilities.ts`, `users.ts`; `admin/facilities`, `admin/users` pages | 2.17 | permission, integration | Facility readiness visible |
| 3.2 | 3 | Fleet: vehicles, drivers, trackers (hashed token), licenses + expiry warnings | S `fleet.ts`; `admin/fleet/*` pages | 3.1 | integration: expired license blocks | CRUD works |
| 3.3 | 3 | Trip builder: waiting list, stop order (≤ `max_trip_stops`), assign; waste → SCHEDULED; driver email via outbox | S `scheduling.ts`; `admin/trips/*` | 3.2 | integration: readiness/license guards; one active trip | Trip created |
| 3.4 | 3 | Trip cancel + reassignment (PLANNED only; cancels OTPs; old driver 403) | S `scheduling.ts`, `POST /api/trips/{id}/reassign` | 3.3 | integration: reassignment invalidation | Tests green |
| 3.5 | 3 | Manifest PDF | `GET /api/trips/{id}/manifest` | 3.3 | scope | PDF downloads |
| 3.6 | 3 | Driver: start trip + arrive (OTP issued via outbox, geofence stored, `null` if no GPS) | S `driver-ops.ts`, `otp.ts`; routes `/start`, `/arrive`; driver UI buttons | 3.3 | integration: idempotent arrive → one OTP | Driver arrives |
| 3.7 | 3 | QR scanner + scan endpoint (SCANNED_AT_PICKUP, handover row, x/n counter) | `/api/stops/{id}/scan`, `src/components/driver/scanner.tsx` | 3.6 | integration: duplicate, wrong stop, already scanned | Scans recorded |
| 3.8 | 3 | **Completion service** + OTP verify (attempts, lock, expiry, constant-time) | S `handover.ts` (`completeStop`), `/verify-otp` | 3.7 | invariant: no partial pickup, concurrency (OTP vs in-app) | Stop COLLECTED atomically |
| 3.9 | 3 | Resend OTP (cooldown, per-stop max) + skip (OTP CANCELLED, scans reset, waste → REGISTERED) | `/resend-otp`, `/skip` | 3.8 | integration | Tests green |
| 3.10 | 3 | Hospital "truck at the door" (polled 10 s) + in-app confirm | `GET /api/hospital/active-handover`, `POST /api/stops/{id}/confirm-handover`, hospital card | 3.8 | facility scope, same completion service | Confirm works |
| 3.11 | 3 | Super Admin override (reason, all scans required, alert) | `POST /api/stops/{id}/override`, admin UI | 3.8 | permission + invariant | Tests green |
| 3.12 | 3 | Gate 3 e2e: happy path + failure paths (double tap, wrong OTP, SMS down → in-app, skip, reassignment) | `tests/e2e/pickup*.spec.ts` | 3.4–3.11 | e2e | Gate 3 review |

## Gate 4 — Tracking — ✅ DONE 10 Oct 2026 (see `docs/changes/gate-4.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 4.1 | 4 | `TrackingProvider` adapter + `POST /api/tracking/v1/ingest` (device token, skew, duplicates, rate limit) | `src/server/integrations/tracking/*`, route | 3.12 | integration: replay, future timestamp, bad token | Tests green |
| 4.2 | 4 | GPS simulator script | `scripts/gps-simulator.ts` | 4.1 | — | Simulated trip moves |
| 4.3 | 4 | Trip association + geofence uses latest point; silent-tracker alert | S `tracking.ts` | 4.1 | integration | Alert shows |
| 4.4 | 4 | Real Leaflet map (`react-leaflet`, dynamic `ssr:false`) replacing `FacilityMap`; live positions (30 s) | `src/components/maps/*`, `GET /api/tracking/live` | 4.3 | e2e: map renders | Radar is a real map |
| 4.5 | 4 | Route replay `GET /api/tracking/trips/{id}` on regulator + admin | route, `regulator/map` | 4.4 | permission | Gate 4 review |

## Gate 5 — Disposal and certificates — ✅ DONE 10 Oct 2026 (see `docs/changes/gate-5.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 5.1 | 5 | Receipt scan + MISSING/REFUSED with reason + complete receipt (waste → RECEIVED) | S `disposal.ts`, `/api/disposal/receive`, `/exception`; disposal UI | 4.5 | invariant: every container accounted | Tests green |
| 5.2 | 5 | Destruction (method, lock first) → DISPOSED / DISPOSED_WITH_EXCEPTION / CLOSED_NO_DESTRUCTION; certificate row PENDING; trip COMPLETED rule | `/api/disposal/waste/{id}/destroy` | 5.1 | integration: lock trigger, no rollback | Tests green |
| 5.3 | 5 | Certificate job: PDF + SHA-256 + storage adapter; FAILED → retry in daily job | S `certificates.ts`, `StorageProvider` | 5.2 | integration: failure keeps destruction | Certificate ISSUED |
| 5.4 | 5 | Public `/verify/[token]` + `POST /api/verify/{token}/check-file` (rate limit; not-found / revoked / pending states) | `(public)/verify/**`, routes | 5.3 | e2e: fake token → not found | Verify works |
| 5.5 | 5 | Certificate download (signed URL, audited) + revoke/reissue | `/api/certificates/{id}/pdf`, `/revoke` | 5.3 | permission | Gate 5 review |

## Gate 6 — Billing and reporting — ✅ DONE 10 Oct 2026 (see `docs/changes/gate-6.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 6.1 | 6 | Contracts CRUD + daily job (EXPIRING_SOON / EXPIRED, license warnings, overdue pickups) `POST /api/jobs/daily-checks` | S `billing.ts`, route | 5.5 | integration | Statuses move |
| 6.2 | 6 | Monthly invoices job (unique per contract/month, VAT, santim) + manual trigger | `/api/jobs/monthly-invoices` | 6.1 | unit: VAT; integration: run twice → one invoice | Drafts created |
| 6.3 | 6 | Issue / settle offline / cancel + invoice PDF + email via outbox; past-due alert | Server Actions, `/api/invoices/{id}/pdf` | 6.2 | permission: only super_admin writes | Tests green |
| 6.4 | 6 | Exports PDF/XLSX (audited) per role scope | `/api/export/[report]` | 6.3 | scope | Exports download |
| 6.5 | 6 | Regulator audit chain check UI + override/geofence evidence views | `regulator/audit` | 6.4 | e2e | Gate 6 review |

## Gate 7 — Production readiness — 🟡 7.1–7.3 DONE 10 Oct 2026; 7.4 runbooks + health done, provider adapters wait for the owner's accounts; 7.5 checklist ready, client acceptance open (see `docs/changes/gate-7.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 7.1 | 7 | Full permission matrix (Appendix C) as automated tests | `tests/permissions/*` | 6.5 | all roles × all services | 100% matrix covered |
| 7.2 | 7 | Security review: headers/CSP, rate limits, secrets, logs | `next.config`, middleware | 7.1 | — | Checklist signed |
| 7.3 | 7 | Failure-path e2e suite (SMS failure, tracker replay, certificate failure…) | `tests/e2e/failures/*` | 7.1 | e2e | Green |
| 7.4 | 7 | Real SMS (Ethio Telecom), email, storage adapters; backup/restore test; monitoring | `src/server/integrations/*`, `docs/runbooks/*` | 7.2 | integration against sandbox | Restore tested |
| 7.5 | 7 | Pilot checklist and client acceptance | `docs/pilot.md` | 7.4 | manual | Client sign-off |

## Gate 8 — Medicine stock and expiry (modules 21–22) — ✅ DONE 11 Oct 2026 (approved by the owner the same day; see `docs/changes/gate-8.md`)

| ID | Gate | Task | Files | Depends on | Tests | Done when |
|---|---|---|---|---|---|---|
| 8.1 | 8 | Schema: stock lines, expiry alerts, disposal requests + lines; `medicine_request_status`; code MD-YYYY-NNNNN; setting `expiry_alert_days`; Workflow Engine entity (EFDA may only approve / reject) | `src/server/db/schema/medicine.ts`, `drizzle/0007_*`, `src/server/workflow/table.ts` | 7.x | unit: transitions; integration: constraints | Migration applied to dev + test |
| 8.2 | 8 | Stock import: CSV / XLSX parsing, preview with row errors, save (upsert by batch), manual add / edit / archive, audited | `src/lib/stock-import.ts`, `src/server/services/medicine.ts`, `/hospital/stock` | 8.1 | unit: parsing; integration: scope, audit | Upload works |
| 8.3 | 8 | Expiry alerts: thresholds 90/30/7 + expiry day, once per line and threshold; daily job + `POST /api/jobs/stock-alerts`; email via outbox; dashboard panels | services, job route, widgets | 8.2 | unit: thresholds; integration: once per threshold | Alerts appear |
| 8.4 | 8 | Disposal requests → EFDA approve / reject (reason) → PHARMACEUTICAL waste record + stock reduced | services, `/hospital/stock/requests`, `/regulator/approvals` | 8.2 | integration: approval → waste, rejection reason, audit | Approved request on the waiting list |
| 8.5 | 8 | Read pages (`/regulator/stock`, `/admin/stock`), navigation, exports, permission matrix (driver / disposal operator 403), e2e | pages, `tests/permissions`, `tests/e2e/stock.spec.ts` | 8.3, 8.4 | permission + e2e | Gate 8 review |
