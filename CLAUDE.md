# CLAUDE.md — Neba CS Medical Waste Management Platform (SafeWaste)

Read this file before every task. It is the single source of truth for scope and rules, together with
`docs/architecture-v1.2.pdf` (System Architecture Document v1.2 — implementation baseline, 7 Oct 2026).
Sections 7.5 (transition table), 14.1 (mandatory rules), 14.2 (end-to-end flow), 14.3 (request pipeline),
14.4 (V1 scope) and Appendix C/D (permission matrix, build gates) of that document are binding.
If a request, this file and the document disagree, stop and ask. Do not add features that are not listed here.
Items marked **DECISION (v1.2 addendum)** were decided on 7 Oct 2026 and must be confirmed with the client in writing.

## 1. What the system does

Tracks medical waste from registration at a hospital, clinic or pharmacy, through an OTP-verified pickup and
GPS-tracked transport, to recorded destruction at one disposal site, then issues a verifiable PDF Certificate of
Disposal. Also manages contracts and monthly invoices, and gives the EFDA Regulatory & Audit Officer read-only
oversight. Medicine stock / expiry alerts / EFDA approval are client-requested but PENDING (see §12).

Scale: 120+ facilities (pilot first, Dire Dawa), 2 vehicles, 2 drivers, 1 disposal site.

The repository started as a **front-end prototype** (mock data in `src/mock/`, browser-side role switcher). The
prototype's **visual design is the reference**; its status names follow v1.1 and must be migrated to §5 below. Its
mock data layer and role switcher are being replaced by the database and Clerk. Do not add new features on top of
`src/mock/`. The role switcher may survive only as a development tool.

## 2. Tech stack (fixed)

- Next.js 14.2 App Router, React 18, TypeScript strict. Follow Next 14 conventions (`middleware.ts`, sync `params`).
  Check the installed version's docs instead of assuming.
- Tailwind CSS + shadcn/ui. Charts: Recharts. Tables: TanStack Table. Forms: react-hook-form + zod.
- Auth: Clerk for identity (sign-in, sessions) and phone-number verification of hospital users. All Clerk code lives
  in `src/server/auth/`. No other file imports `@clerk/*` except the root layout provider and `middleware.ts`.
- Database: Neon PostgreSQL (pooled URL for the app, unpooled for migrations) + Drizzle ORM + drizzle-kit migrations.
- Maps: OpenStreetMap tiles via Leaflet + react-leaflet; tile URL and attribution from env vars. Map components are
  client-only (dynamic import, `ssr: false`) and loaded only on map pages. OSM public tiles are for the demo only.
- GPS: hardware trackers in the vehicles (vendor not chosen). The driver app does NOT send location.
- SMS: Ethio Telecom SMS API behind `SmsProvider` (pickup OTPs). Email behind `EmailProvider` (certificates,
  invoices, alerts — never OTPs). Development uses console/log providers.
- Testing: Vitest (unit/integration), Playwright (e2e). Package manager: **npm** (keep `package-lock.json`;
  never pnpm or yarn). Run scripts with `npm run <script>`.
- Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `user:assign`.
- Lint: ESLint 8 with `.eslintrc.json` extending `next/core-web-vitals` + `next/typescript` (Next.js Strict preset).
- **No git.** The project is not a git repository. Every gate keeps a change log in `docs/changes/<gate>.md`
  (Task | File | Action | Why) with a "How to undo" note; backups are folder copies made before each gate.
- Time zone for display and monthly periods: Africa/Addis_Ababa. Hosting is chosen by the client: env vars only.

## 3. Roles (6) — one role per user (enum `user_role`)

| Code              | Display name                    | Area                                   | Can do                                                                                                                                                                                                        |
| ----------------- | ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| super_admin       | Super Administrator             | /admin (billing at /admin/finance)     | Oversight; facilities, users, vehicles, drivers, trackers, settings; build/change trips; fleet radar; override pickup with reason; revoke certificates; contracts, monthly invoices (ETB), settlement; alerts |
| hospital_admin    | Hospital Administrator          | /hospital                              | Everything hospital_staff can, plus: manage own facility's users and who receives pickup OTPs; invoice totals (ETB) and contract status                                                                       |
| hospital_staff    | Hospital Staff / EHO            | /hospital                              | Register waste, label containers, follow pickups, receive pickup OTP on verified phone, confirm handover in-app (fallback), download certificates                                                             |
| driver | Fleet Driver | /driver (mobile-first) | Own trips in stop order, arrival, container QR scans, OTP entry, skip with reason; map of own trip in progress |
| disposal_operator | Disposal Operator | /disposal (mobile-first) | Inbound reception, container scans, incinerator queue, missing/refused, destruction records; certificates and exports of OWN site; live map of inbound trucks |
| efda_officer      | EFDA Regulatory & Audit Officer | /regulator (audit at /regulator/audit) | READ-ONLY: compliance, volume analytics, route replay, certificates, audit ledger + hash-chain check, medicine stock, all facilities. ONE write: approve / reject medicine disposal requests (§12)            |

- There is NO finance_officer, NO auditor. `/finance` only redirects to `/admin/finance`.
- There is NO "authorized contact" on the facility. Pickup OTPs go to the facility's hospital users (§6).
- Hospital roles always have a `facility_id`. **DECISION (v1.2 addendum):** `disposal_operator` also has a
  `facility_id` pointing to the DISPOSAL_SITE facility. All other roles have none (CHECK constraint).
- Public routes: `/`, `/sign-in`, `/verify/*`, `/api/health`, `/api/verify/*`, tracker ingest (device token),
  jobs (`CRON_SECRET`), Clerk webhook (signature). Everything else requires sign-in.
- No `users` row, no role, or `active = false` → redirect to `/pending`. `/` redirects signed-in users to their area.
- Every service and query starts with `requireRole(...)`; hospital roles also `requireFacilityScope(facilityId)`.
  Hospital queries filter `WHERE facility_id = currentUser.facilityId` inside SQL, never afterwards in the UI.
  IDs in URLs are always re-checked against the user's scope.
- `efda_officer` is rejected (403) by every write service except approving / rejecting medicine disposal requests
  (§12, owner decision 11 Oct 2026). Tests prove this.
- Driver actions are authorized against the CURRENT trip assignment inside the transaction.
- Full permission matrix: Appendix C of the architecture document.

## 4. Source of truth for users

- `users` holds `clerk_user_id`, `role`, `facility_id`, `active`, `full_name`, `email`, `phone_e164`,
  `phone_verified`, `receives_pickup_otp` (hospital roles only). Phone + verification are synced from Clerk via
  webhook (`POST /api/webhooks/clerk`); Clerk is the only place a phone gets verified.
- Role checks read the database (cached per request with React `cache`), never Clerk metadata.
- Roles are assigned by super_admin (or hospital_admin for their own facility's hospital users) and by the dev CLI
  `npm run user:assign`. Staff accounts are invitation-only; no public sign-up. MFA required for super_admin.

## 5. Statuses (Postgres enums; change only through the Workflow Engine)

All other moves are refused with 409 `INVALID_TRANSITION`. Locked records (destroyed containers, disposed waste,
locked disposal records) cannot change for any role.

| Enum                      | Values                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `waste_status`            | REGISTERED, SCHEDULED, IN_TRANSIT, RECEIVED, DISPOSED, DISPOSED_WITH_EXCEPTION, CLOSED_NO_DESTRUCTION, CANCELLED |
| `container_status`        | LABELLED, SCANNED_AT_PICKUP, COLLECTED, RECEIVED, MISSING, REFUSED, DESTROYED                                    |
| `handover_status`         | SCANNED, CANCELLED                                                                                               |
| `trip_status`             | PLANNED, IN_PROGRESS, COMPLETED, CANCELLED                                                                       |
| `stop_status`             | PENDING, ARRIVED, COLLECTED, COLLECTED_OVERRIDE, SKIPPED                                                         |
| `collection_method`       | OTP, IN_APP, OVERRIDE                                                                                            |
| `otp_status`              | ISSUED, VERIFIED, EXPIRED, LOCKED, CANCELLED                                                                     |
| `certificate_status`      | PENDING, ISSUED, FAILED, REVOKED                                                                                 |
| `invoice_status`          | DRAFT, ISSUED, SETTLED_OFFLINE, CANCELLED                                                                        |
| `contract_status`         | ACTIVE, EXPIRING_SOON, EXPIRED                                                                                   |
| `facility_status`         | ACTIVE, INACTIVE, SUSPENDED                                                                                      |
| `facility_type`           | REFERRAL_HOSPITAL, GENERAL_HOSPITAL, PRIMARY_HOSPITAL, CLINIC, PHARMACY, DISPOSAL_SITE                           |
| `vehicle_status`          | ACTIVE, IN_TRANSIT, MAINTENANCE, OFFLINE                                                                         |
| `driver_status`           | ON_DUTY, ON_TRIP, OFF_DUTY                                                                                       |
| `outbox_status`           | PENDING, SENT, FAILED                                                                                            |
| `user_role`               | super_admin, hospital_admin, hospital_staff, driver, disposal_operator, efda_officer                             |
| `medicine_request_status` | PENDING_APPROVAL, APPROVED, REJECTED (§12)                                                                       |

Transitions:

- **Waste:** REGISTERED → SCHEDULED (added to a trip stop after readiness/license/assignment checks) ·
  SCHEDULED → REGISTERED (stop skipped or trip cancelled before pickup) · REGISTERED/SCHEDULED → CANCELLED (reason;
  no container COLLECTED; **blocked with 409 while its stop is ARRIVED** — the driver skips the stop instead) ·
  SCHEDULED → IN_TRANSIT (stop completion, atomically) · IN_TRANSIT → RECEIVED (every container RECEIVED, MISSING or
  REFUSED) · RECEIVED → DISPOSED (every container DESTROYED) · RECEIVED → DISPOSED_WITH_EXCEPTION (≥ 1 DESTROYED, rest
  MISSING/REFUSED with reason) · **RECEIVED → CLOSED_NO_DESTRUCTION (DECISION v1.2 addendum: every container
  MISSING/REFUSED; reason; alert; no certificate)**.
- **Container:** LABELLED → SCANNED_AT_PICKUP (driver scan on an ARRIVED stop) → COLLECTED (stop completion only) ·
  SCANNED_AT_PICKUP → LABELLED (stop skipped/cancelled before completion; handover row → CANCELLED) ·
  COLLECTED → RECEIVED / MISSING / REFUSED (operator; reason for the last two; alert) · RECEIVED → DESTROYED.
- **Trip:** PLANNED → IN_PROGRESS (assigned driver; vehicle + driver licenses valid; no other active trip per vehicle
  or driver) · **IN_PROGRESS → COMPLETED (DECISION v1.2 addendum: all stops final AND every collected container is
  RECEIVED/MISSING/REFUSED at the site)** · PLANNED → CANCELLED (super_admin, reason) · IN_PROGRESS → CANCELLED
  (super_admin, reason, no stop ARRIVED, nothing collected). Reassignment of vehicle/driver: super_admin, PLANNED only;
  cancels active OTPs; former driver loses access immediately.
- **Stop:** PENDING → ARRIVED (driver; OTP issued via outbox; geofence distance stored) → COLLECTED (OTP verified or
  in-app confirmation) | COLLECTED_OVERRIDE (super_admin, reason) · PENDING/ARRIVED → SKIPPED (driver or super_admin, or the system when its last waste is cancelled on a PLANNED trip — see §6,
  reason). `collection_method` and `confirmed_by` are set only when completion succeeds.
- **OTP:** ISSUED → VERIFIED | EXPIRED | LOCKED | CANCELLED. Skip, cancel and reassignment cancel all active OTPs.
- **Certificate:** PENDING → ISSUED | FAILED; FAILED → ISSUED (retry job); ISSUED → REVOKED (super_admin, reason).
  Only ISSUED is publicly valid. Reissue = new row; old one REVOKED. Waste status does not change on revoke.
- **Invoice:** DRAFT → ISSUED (due date = issue date + `invoice_due_days`) → SETTLED_OFFLINE (payment reference and
  date) · DRAFT/ISSUED → CANCELLED (reason). Only super_admin. "Overdue" is NOT a status: it is derived
  (ISSUED and past due date) and shown as an alert.
- **Contract:** ACTIVE → EXPIRING_SOON → EXPIRED, set by the daily job.

## 6. Key business rules

- **Registration:** category required, `container_count >= 1`, `weight_kg > 0`. Weight is recorded only (no
  discrepancy checks). No disposal photos. All containers are created LABELLED in the same transaction.
- **Labels:** one unique, never-reused container code and QR per container. Label shows facility name, category,
  container x of n, Waste ID; Amharic text is a setting (`label_amharic_enabled`, font Noto Sans Ethiopic).
  Reprints are audited; codes stay the same. QR holds only a container code or verify URL — never personal data.
- **OTP:** 6 digits from a secure RNG, stored as a hash, compared in constant time, single use; expiry and max
  attempts from settings. Recipients = the stop facility's active hospital users with `phone_verified = true` and
  `receives_pickup_otp = true`; one SMS each via the outbox. No email OTP. A facility with zero recipients cannot be
  scheduled ("not ready" on the admin dashboard). Resend after `otp_resend_cooldown_seconds`, at most
  `otp_max_per_stop` codes per stop, then override only.
- **NO PARTIAL PICKUP.** A scan records evidence only (handover SCANNED + container SCANNED_AT_PICKUP). OTP verify,
  in-app confirmation (`POST /api/stops/{id}/confirm-handover`, hospital user of the SAME facility, stop ARRIVED)
  and super_admin override (reason) all call ONE completion service. It locks and re-checks the stop and container
  rows, recomputes the expected count from all waste linked via `trip_stop_waste`, rejects missing, duplicate or
  already-collected containers, then atomically sets all containers COLLECTED, the stop COLLECTED/COLLECTED_OVERRIDE
  and the waste IN_TRANSIT. If not every container can be collected, the stop is SKIPPED. /hospital shows
  "truck at the door" for ARRIVED stops (polled every 10 s).
- **Geofence:** on arrival compare the vehicle's latest GPS point with the facility location; store
  `arrival_distance_m` and `geofence_ok`. Flag only, never blocks. **DECISION (v1.2 addendum):** no recent GPS
  point → `geofence_ok = null`, shown as "no GPS".
- **Disposal:** every expected container becomes RECEIVED, MISSING or REFUSED before the waste leaves IN_TRANSIT.
  Destruction locks the disposal record FIRST, then enqueues certificate generation; destruction is never rolled back.
- **Certificate:** created PENDING after destruction; a retryable job generates the PDF (FAILED → retry); lists
  destroyed containers and exceptions; PDF SHA-256 stored. PENDING/FAILED have no public download.
  **DECISION (v1.2 addendum):** public `/verify/[token]` shows certificate number, status, issue date, facility name,
  Waste ID, category, container count, weight, destruction date and method, and a PDF upload to compare the hash.
  Never person names, phone numbers or emails.
- **Invoices:** monthly from ACTIVE contracts (`monthly_fee_santim`), VAT rate copied onto the invoice at creation,
  created as DRAFT; unique (contract_id, period_start). No payment gateway, Telebirr or CBE Birr. The monthly job is
  POST-only with `CRON_SECRET`; super_admin can trigger it manually.
- **GPS:** `gps_events` from trackers through `TrackingProvider`: `POST /api/tracking/v1/ingest`, per-device token
  (stored hashed). Duplicates ignored via unique (device_id, recorded_at); timestamps more than
  `tracker_max_clock_skew_minutes` in the future are rejected. Events link to a trip by vehicle + time window. Maps
  show positions only for IN_PROGRESS trips. **DECISION (v1.2 addendum, owner 11 Oct 2026):** every role sees live
  truck + driver positions while a trip is IN_PROGRESS, in its scope — super_admin and efda_officer all trips;
  hospital roles trips with a stop at their facility; disposal_operator all inbound trips; driver own trip. Outside
  IN_PROGRESS trips nobody sees positions; route history (replay) stays super_admin and efda_officer only. A dev simulator script generates tracks for demos.
- **Audit log:** `audit_logs` is INSERT-only (trigger blocks UPDATE/DELETE) with `prev_hash`/`hash`.
  **DECISION (v1.2 addendum):** inserts are serialized (Postgres advisory lock) so the chain cannot fork.
  Logged: every create/update/status change, OTP issue/verify/fail, overrides, scans, destruction, certificate
  issue/revoke/download, invoice actions, exports, role changes. Page views are not logged.
- **Outbox:** every SMS/email is written to `outbox_messages` in the same transaction as the business change, sent
  by the dispatcher (after commit and every minute via `POST /api/jobs/outbox`), retried 1/5/15/60 min up to
  `outbox_max_attempts`, then FAILED + admin alert. Expired OTP messages are not retried.
- **Idempotency:** EVERY state-changing operational command (arrive, scan, verify OTP, resend OTP, skip, override,
  confirm-handover, reassign, receive, exception, destroy) requires an `Idempotency-Key` header; the key is checked
  and stored in `idempotency_keys` inside the same transaction; kept 24 h; a replay returns the stored response.
- **Request pipeline (no step skipped):** authenticate → load DB role/facility scope → zod validation → idempotency
  check → application service → Workflow Engine transaction (owned-table writes + audit + outbox) → commit →
  response. SMS, email, PDF and GPS providers are never called synchronously inside it.
- **Other:** trip manifest PDF (`GET /api/trips/{id}/manifest`); `licenses` for vehicles, drivers, facilities and
  site — an expired license blocks assignment and trip start, warning `license_expiry_warning_days` before.
  **DECISION (v1.2 addendum, owner 11 Oct 2026):** a MISSING license is a warning on the admin dashboard, not a block.
  Dashboard alerts: overdue pickups, silent tracker during an IN_PROGRESS trip, FAILED outbox messages, overrides
  used, issued invoices past due date. `GET /api/health` (database check + version, no data).

## 7. Settings (table `settings`, editable by super_admin, audited)

Read with `getSetting(key)`; never hard-code business values.

| Key                            | Default                  | Key                          | Default                                             |
| ------------------------------ | ------------------------ | ---------------------------- | --------------------------------------------------- |
| otp_expiry_minutes             | 10                       | overdue_pickup_days          | 7                                                   |
| otp_max_attempts               | 5                        | contract_expiry_warning_days | 30                                                  |
| otp_resend_cooldown_seconds    | 60                       | license_expiry_warning_days  | 30                                                  |
| otp_max_per_stop               | 3                        | vat_rate_percent             | 15                                                  |
| geofence_radius_m              | 300                      | outbox_max_attempts          | 6                                                   |
| tracker_silent_minutes         | 15                       | label_amharic_enabled        | false                                               |
| tracker_max_clock_skew_minutes | 5                        | invoice_due_days             | 30                                                  |
| max_trip_stops                 | 6                        | system_name                  | SafeWaste Biohazard Tracking Network                |
| region_focus | Dire Dawa Administration | expiry_alert_days | [90, 30, 7] (§12; the expiry day is always alerted) |
| max_containers_per_registration | 100 | max_weight_kg_per_registration | 10000 (DECISION 11 Oct 2026) |

Optional enhancements — do NOT build unless the client approved: daily statistics roll-up, SMS delivery reports,
CSV import of facilities/users, PAdES PDF signature, Ethiopian calendar display, automated data retention jobs.

## 8. Architecture rules

- Modular monolith. Layers: presentation (`src/app`, `src/components`) → access (`src/server/auth`, validation) →
  application (`src/server/services`, `src/server/workflow`) → data (`src/server/db`, `src/server/integrations`).
- Pages never touch the database. Reads go through `src/server/queries/<area>.ts` (server-only, typed, scoped).
  No Server Component, Client Component, Server Action or Route Handler mutates business tables directly: they call
  services in `src/server/services/`, which use the Workflow Engine (`src/server/workflow`).
- A module reads and writes only its own tables; it uses other modules through their service functions.
- Server Components by default; `"use client"` only for interaction (forms, scanner, map, charts, polling).
- Dashboards: one async Server Component per widget, each in `<Suspense>` with a skeleton. SQL aggregates,
  `Promise.all` for independent queries, no N+1, a `LIMIT` on every list, cursor pagination (max 100).

## 9. Data and code conventions

- Primary keys: UUID v7 `id`, never shown to users. Human codes unique and never reused: `WR-2610-00042`,
  `WR-2610-00042-C03`, `TR-261004-01`, `CD-2026-00017`, `INV-2026-10-0031`; facilities `DD-REF-001`.
- Money: integer santim (`bigint`, ETB × 100), shown as ETB via `src/lib/money.ts`. Timestamps: `timestamptz` in
  UTC, shown in EAT via `src/lib/dates.ts` (Ethiopian calendar may be added there later).
- CHECKs: `container_count >= 1`, `weight_kg > 0`, money `>= 0`, facility_id rule from §3.
- FKs: explicit `ON DELETE RESTRICT` unless there is a written reason. No hard deletes of business records.
- **DECISION (v1.2 addendum, 7 Oct 2026) — prototype fields:**
  - DROP (never add to the schema): incinerator temperature / emissions, certificate "witness", facility monthly
    waste estimate, extra waste-category fields (categories keep only `code`, `name`, `colour_code`, `active`),
    vehicle battery level.
  - KEEP as optional address parts on `facilities`: `city`, `sub_city`, `woreda`, `kebele` (text, nullable), in
    addition to `region`, `address`, `lat`, `lng`.
  - ADD: `contracts.contract_code` human code `CT-YYYY-NNNN` (unique, never reused); `invoices.due_date` set when
    the invoice is ISSUED (issue date + `invoice_due_days`), stored so later setting changes never alter old invoices.
- `disposal_records` rows with `locked = true` cannot be updated (trigger).
- Validate every input with zod (shared schemas in `src/lib/validation/`). Env vars validated in `src/env.ts`.
- Errors: throw `AppError(code, httpStatus)`; API errors are `{ error: { code, message, details } }`.
- Every status is shown with `StatusBadge`: colour plus text, never colour alone.
- Match the prototype's look (dark zinc theme, emerald accent, components in `src/components/shared/`).
- No secrets in code or logs. Mask phone numbers in logs. Never log OTPs or tokens. Structured JSON logs with request ID.
- Never use real patient or personal data. Seed data is fictional and must satisfy every rule in §5, §6 and §9.

## 10. Testing

- Unit: transition table, guards, OTP rules, code formats, money/VAT, dates.
- Integration (test database branch): services, scope checks, transactions, audit + outbox rows, idempotency under
  concurrent retry, no partial pickup, OTP cancellation, reassignment invalidation, certificate no-rollback.
- Permission tests: each role × each area/service → allowed or 403/redirect; facility scope for hospital roles;
  `efda_officer` gets 403 on every write.
- Playwright: smoke test per role, full flow registration → certificate → invoice, failure paths (SMS failure,
  double tap, skipped stop, reassignment, missing/refused container, certificate failure, tracker replay).

## 11. Open questions (do not decide these yourself)

- Tracker vendor and data format.
- Onboarding 120+ facilities (CSV import may be approved later).
- Ethiopian calendar display.
- Which EFDA officers approve which facilities (any officer for now).
- Whether Clerk phone verification SMS reaches +251 numbers reliably (test in Gate 1).
- Client confirmation of the v1.2 addendum DECISIONS above.

**DECISIONS (v1.2 addendum, owner, 11 Oct 2026)** — answers to the open questions:
1. Permissions: live map for every role during IN_PROGRESS trips (see §6 GPS); the disposal operator downloads
   certificates and exports for his OWN site only; efda_officer does NOT read contracts or invoices.
2. Billing: postponed — the current choices are temporary placeholders; the questions are in `docs/later.md`
   ("Billing — decide later"). Do not change billing until decided.
3. Cancelling the ONLY waste on a stop: trip PLANNED → allowed; the empty stop is removed automatically (SKIPPED by
   the system with a reason; audited; super_admin notified by email). Trip IN_PROGRESS → refused (409); the driver
   skips the stop.
4. Trip rules accepted: a trip starts only on its planned day; one stop ARRIVED at a time; one open trip per vehicle /
   driver per day; a facility without OTP recipients gets no code at arrival. Missing license = dashboard warning;
   expired license = block.
5. Registration limits 100 containers / 10,000 kg accepted, stored as admin-editable settings.
6. Amharic labels: off until the owner provides the wording (question for the client in `docs/later.md`).
7. Medicine category: PHARMACEUTICAL only, accepted for now.
8. Next.js: upgraded to the latest stable version that fixes the security advisories (separate task) — see §2.
9. Demo (seeded) certificates without a file show "Demo certificate: no file" instead of an error.
10. The 3 unused prototype files are deleted.
11. Home page: placeholders stay; photos and contact details are a question for the client (`docs/later.md`).

## 12. Medicine stock and expiry — APPROVED (owner, 11 Oct 2026) — modules 21–22, Gate 8

Rules (owner decision 11 Oct 2026):

- **Who sees what** (enforced in services and SQL, not only the UI):
  - hospital_admin and hospital_staff: ONLY their own facility's stock, alerts and requests; both may upload / edit
    stock; ONLY the hospital_admin creates disposal requests (owner decision 11 Oct 2026).
  - super_admin: all facilities (read, alerts, oversight); does NOT approve disposal requests.
  - efda_officer: all facilities, read-only on stock; the ONLY role that approves or rejects medicine disposal
    requests (reason required to reject). Every other efda_officer write stays 403.
  - driver and disposal_operator: no access at all — 403 from every stock service and query, no menu, no alerts, no
    counts.
- **Stock:** per facility, upload Excel (.xlsx) or CSV (item, strength, form, batch, quantity, unit, expiry date) with a
  preview and row errors before saving; manual add / edit; history kept (no hard deletes; audited); list filters
  expiring / expired.
- **Expiry alerts** at the `expiry_alert_days` thresholds (default 90, 30, 7) and on the expiry day, computed by the
  daily job; each threshold alerts once per stock line. Dashboard panel for the facility's hospital users,
  super_admin (all) and efda_officer (all). Email via the outbox to the facility's hospital_admin users and to
  efda_officer users. No SMS.
- **Disposal requests:** a hospital user selects stock lines and quantities → PENDING_APPROVAL → efda_officer APPROVED
  or REJECTED (reason), through the Workflow Engine. APPROVED creates a PHARMACEUTICAL waste record (REGISTERED,
  containers LABELLED) for that facility, linked to the request, and reduces the stock — one transaction.
  Non-medicine waste (sharps, infectious, …) is still registered directly; medicine (category PHARMACEUTICAL) can
  NOT be registered directly — only through an EFDA-approved request (owner decision 11 Oct 2026).
- **Pages:** /hospital/stock, /hospital/stock/requests (own facility); /regulator/stock, /regulator/approvals (EFDA);
  /admin/stock (all, read). Exports (Excel / PDF) in each role's scope.
- **Decided 11 Oct 2026:** only the columns item, strength, form, batch, quantity, unit, expiry date (until the owner
  changes them); the English email wording is accepted; re-uploading a batch replaces its quantity; requests ask for
  containers and weight; the waste record is registered in the requester's name.

## 13. Working rules for Claude

- Work in the steps of the active PROMPT file and stop at every "STOP" for review.
- Before writing code: list the files you will create/change and the tests you will write. Wait for approval.
- Work in small steps. Before saying work is done, run
  `npm run typecheck && npm run lint && npm run test && npm run build` and report the output honestly.
- Keep the active gate's change log (`docs/changes/<gate>.md`) updated after every task.
- Never delete a file without listing it first and getting approval.
- Do not build features the active prompt marks out of scope; do not show buttons for features that do not exist.
- Never invent requirements or Ethiopian legal rules. Mark assumptions as ASSUMPTION and ask.
- Do not commit unless asked. Never commit `.env*` files except `.env.example`.
- End every response with: what was done, test results, open questions, risks, next step. Then stop.
