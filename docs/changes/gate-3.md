# Change log — Gate 3 (pickup)

Started 10 Oct 2026. No git; this file replaces commit history for Gate 3. Secret values are never written here.
Owner instruction (10 Oct 2026): "continue all the 12 step step don't stop" — tasks 3.1–3.12 are built in one go,
with checks after each task.

## Shared infrastructure

| File | Action | Why |
|---|---|---|
| `src/server/api/command.ts` | created | request pipeline for operational commands (§14.3): `handleCommand` (request ID, JSON + zod 422, Idempotency-Key header, `{ error }` JSON) and `runIdempotent` (one transaction: idempotency key + command) |
| `src/server/api/action.ts` | created | `asAction`: Server Actions only translate service results / AppErrors for forms; unexpected errors logged with a request ID |
| `src/server/services/_errors.ts` | created | shared `invalid()` (422 with field errors) and `friendlyDbError()` (unique → 409, CHECK / trigger → readable 422) |
| `src/components/shared/form-field.tsx` | created | `Field`, `FormError`, shared input / button classes (accessible labels, `aria-invalid`, 44 px targets) |
| `src/server/db/client.ts`, `tests/integration/db.ts` | changed | `connectionTimeoutMillis: 15 000` — a dropped Neon WebSocket fails fast instead of hanging the request |
| `vitest.integration.config.ts` | changed | test timeout 120 s (each commit to Neon takes seconds on this network) |

## 3.1 Facilities and users — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/lib/validation/facility.ts` | created | facility schema (code XX-XXX-000, optional city / sub-city / woreda / kebele, lat / lng), status schema, user-access schemas |
| `src/server/services/facilities.ts` | created | super_admin: create / update facility (code never changes; nothing becomes or stops being the disposal site), status through the Workflow Engine; user access (role, facility, active, pickup-code flag; cannot remove own admin access). hospital_admin: active / pickup-code flags of OWN facility's hospital users only (others → 404; cannot deactivate self). All audited (`facility.*`, `user.role_changed`, `user.access_changed`) |
| `src/server/queries/admin.ts`, `_shared.ts`, `hospital.ts` | changed | facilities with readiness (users, OTP recipients, contract), facility detail, users (phone masked), hospital users |
| `src/types/view-models/admin.ts` | changed | `FacilityRow`, `FacilityDetail`, `UserRow` |
| `src/components/admin/facility-form.tsx`, `people-tables.tsx` | created | facility form + status control; facilities / users tables; user access form; hospital users list with toggles |
| `src/app/(desk)/admin/facilities/**`, `admin/users/**`, `hospital/users/**` | created | pages + Server Actions; new tabs "Facilities", "Users", hospital "Users & Pickup Codes" (hospital_admin) |
| `tests/integration/facilities-users.test.ts` | created | 5 tests: create audited, duplicate 409, bad input 422, other roles 403; code never changes, no type switch to the site, status via the engine + audit trail; self-demotion 403, driver keeps role (trigger → 422), OTP needs a verified phone (422); role change audited as `user.role_changed`; hospital_admin scope (other facility 404, self-deactivate 403, staff 403) |

Not built (needs Clerk, last per the owner's decision): inviting / creating users. Names, emails and phones come
from Clerk and are never edited here; phone verification happens in Clerk only.

## 3.2 Fleet and licences — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/lib/validation/fleet.ts` | created | vehicle, vehicle status, driver profile, tracker, licence schemas |
| `src/server/services/fleet.ts` | created | vehicles (create / update / status through the engine; blocked while on a trip in progress), driver profiles (user must have the driver role), trackers (token shown ONCE, only SHA-256 stored, rotation, activate / deactivate), licences (renewal = new row). All audited; tokens never audited or logged |
| `src/server/services/licences.ts` | created | `expiredLicences(subjects, date)`: latest licence per kind; used by trip assignment and start (3.3 / 3.6) |
| `src/server/queries/admin.ts`, `src/types/view-models/admin.ts` | changed | `getAdminFleet` (vehicles, drivers, trackers, licences with VALID / EXPIRING / EXPIRED / NONE, driver candidates) |
| `src/components/admin/fleet-manager.tsx`, `src/app/(desk)/admin/fleet/{manage/page,actions}.tsx` | created | /admin/fleet/manage + tab "Fleet & Licences" |
| `tests/integration/fleet.test.ts` | created | 4 tests: vehicle create / duplicate / 403; token once + SHA-256 stored + rotation, never in the audit log; licence expiry per date and renewal; vehicle status via engine and blocked on a trip |

ASSUMPTION: a subject with NO licence on record is not blocked (CLAUDE.md only makes expiry a rule); the fleet page
shows "No licence on record". Please confirm which licences are mandatory.

Checks (10 Oct 2026): typecheck ✔ · lint ✔ · unit 122/122 ✔ · integration (3.1 + 3.2 files) 9/9 ✔.
The network to Neon was down for part of the day; database tests ran when it came back.

## 3.3–3.11 Trips, driver operations, completion, in-app, override — done 10 Oct 2026

| Task | File | Action | Why |
|---|---|---|---|
| 3.3 / 3.4 | `src/lib/validation/trip.ts` | created | trip plan, reason, reassign, scan, OTP schemas |
| 3.3 / 3.4 | `src/server/services/scheduling.ts` | created | `createTrip` (super_admin): date ≥ today, ≤ `max_trip_stops`, unique facilities; vehicle available; vehicle / driver not on another open trip that day; facility ACTIVE + ready (≥ 1 OTP recipient); no expired licence (vehicle, driver, facilities, site) on the date; waiting waste locked FOR UPDATE; trip PLANNED + stops PENDING + links + waste → SCHEDULED (engine) + audit + driver email (outbox). `cancelTrip` (PLANNED, or IN_PROGRESS with no arrival / pickup; stops released; vehicle / driver freed; driver emailed). `reassignTrip` (PLANNED only; same guards; active OTPs cancelled; old + new driver emailed) |
| 3.5 | `src/server/integrations/pdf/manifest.ts`, `src/server/services/manifest.ts`, `src/app/api/trips/[id]/manifest/route.ts` | created | trip manifest PDF (stops, waste, container codes, signature lines); super_admin any trip, driver only the CURRENTLY assigned trip (else 404); every download audited (`trip.manifest_printed`) |
| 3.6–3.9 | `src/server/services/otp.ts` | created | 6-digit codes (crypto RNG), stored as HMAC bound to the stop (key derived from `OUTBOX_ENCRYPTION_KEY`, label `safewaste-otp-v1`), constant-time compare; per-stop limit; one SMS per recipient via the outbox (code encrypted at rest, expires); audit without the code |
| 3.6–3.11 | `src/server/services/pickup-core.ts` | created | `releaseStop` (OTPs cancelled, scans CANCELLED, containers LABELLED, links released, waste → REGISTERED, stop SKIPPED); `maybeCompleteTrip` (all stops final AND nothing on board → COMPLETED, vehicle / driver freed) |
| 3.6–3.11 | `src/server/services/pickup.ts` | created | `startTrip` (assigned driver, planned day, licences, one active trip); `arriveAtStop` (one ARRIVED stop at a time; geofence from the latest GPS point within `tracker_silent_minutes`, else null; OTP issued); `scanContainer` (evidence only: handover + SCANNED_AT_PICKUP; unknown 404, other stop / duplicate 409); **`completeStop` — the ONE completion service** (locks stop + every expected container; any missing scan → 409 INCOMPLETE_SCAN; then containers COLLECTED, stop COLLECTED / COLLECTED_OVERRIDE with method + confirmed_by, waste IN_TRANSIT, OTPs cancelled — atomically); `verifyOtp` (scans checked first so a code is never used up; wrong → attempt counted and COMMITTED, LOCKED at `otp_max_attempts`; expired → EXPIRED; right → VERIFIED + completion); `resendOtp` (cooldown 429, per-stop limit); `skipStop` (driver of the current trip or super_admin, reason); `confirmHandover` (hospital user of the SAME facility, else 404); `overrideStop` (super_admin, reason) |
| 3.6–3.11 | `src/app/api/trips/[id]/{start,cancel,reassign}/route.ts`, `src/app/api/stops/[id]/{arrive,scan,verify-otp,resend-otp,skip,confirm-handover,override}/route.ts` | created | thin route handlers through `handleCommand` (Idempotency-Key required) |
| 3.10 | `src/server/queries/hospital.ts`, `src/app/api/hospital/active-handover/route.ts`, `src/components/hospital/truck-at-door.tsx` | changed / created | "Truck at the door" card on /hospital, polled every 10 s while visible; confirm in the app when every container is scanned |
| 3.6–3.9 | `src/components/driver/{scanner,stop-actions,start-trip-button}.tsx`, `stop-card.tsx`, `driver/page.tsx`, `src/server/queries/driver.ts` | created / changed | Start trip (today's planned trip), "I have arrived", camera QR scanner (BarcodeDetector) + typed fallback, scan progress x / n, code entry, new code, skip with reason; each intended action keeps its idempotency key until it succeeds or is refused (double tap = once) |
| 3.3 / 3.4 / 3.11 | `src/server/queries/admin.ts`, `src/types/view-models/admin.ts`, `src/components/admin/{trip-planner,trip-admin}.tsx`, `src/app/(desk)/admin/trips/**` | created / changed | waiting list (oldest / overdue first, readiness), trip planner, trip list, trip detail with geofence evidence, method, reasons, cancel / reassign / skip / override, manifest link; tab "Trips" |
| 3.6 | `src/server/outbox/templates.ts` | changed | `trip.assigned` email (new / reassigned / cancelled) |
| — | `src/lib/client/command.ts` | created | browser helper: POST with Idempotency-Key, typed result, network failure keeps the key for a retry |
| — | `src/lib/env-schema.ts`, `src/server/workflow/engine.ts`, `.env.example`, `playwright.config.ts`, `tests/integration/setup-env.ts` | changed | `OUTBOX_DISPATCH_AFTER_COMMIT=0` (dev / tests only, refused in production): messages wait for the outbox job so tests can read a pickup code before it is sent and wiped |
| tests | `tests/integration/pickup.test.ts` | created | 11 tests (each builds its own facility / vehicle / drivers / waste): planning guards; full OTP pickup with double-tap replay, wrong code committed, NO PARTIAL PICKUP, atomic completion, codes never in the audit log; lock after max attempts; OTP vs in-app race → exactly one; in-app scope + incomplete; override reason + scans + EFDA 403; resend cooldown / limit; skip resets everything and completes an empty trip; reassignment (old driver 403); cancel rules; EFDA 403 on every command |
| tests | `tests/unit/env.test.ts` | changed | the dispatch switch is refused in production |

ASSUMPTIONS (please confirm):
- A trip starts on its planned day (EAT) only.
- One ARRIVED stop at a time per trip (the driver finishes or skips it before arriving elsewhere); stops may be visited out of order.
- A vehicle or driver can have only one open trip per day.
- When a facility has no OTP recipient at arrival time, the stop is still ARRIVED (no code); in-app confirmation or override completes it.

Checks (10 Oct 2026): typecheck ✔ · lint ✔ · unit 123/123 ✔ · integration `pickup.test.ts` 11/11 ✔.

## Fix: transactions were not real inside the Next.js server — 10 Oct 2026

Found by the 3.12 e2e run (`SAVEPOINT can only be used in transaction blocks`). drizzle's Neon driver gives a
transaction its own connection only when `client instanceof Pool`; under the Next.js bundler the Neon `Pool` class
can exist twice, the check fails, and the statements of one "transaction" are spread over several pooled
connections. It went unnoticed while every transaction ran its statements one after another on a single idle
connection; it broke as soon as a transaction ran two queries in parallel. Integration tests (Vitest, one module
copy) could not see it.

| File | Action | Why |
|---|---|---|
| `src/server/db/client.ts` | changed | `withTransaction(fn)`: checks out ONE connection, runs BEGIN … COMMIT / ROLLBACK on it, releases it (discards it after a network failure) |
| `src/server/workflow/engine.ts` | changed | `inWorkflow` uses `withTransaction` (every service transaction) |
| `src/server/outbox/dispatcher.ts` | changed | each message in its own `withTransaction` (tests still pass their own transaction) |
| `tests/unit/mocks.test.ts` | changed | guard: no code may call `db.transaction()` directly |

## Fix: unexpected errors were not logged — 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/server/errors.ts` | changed | `errorResponse` now logs every 5xx with request ID, message, cause and stack (redacted) — its comment promised it, the code did not |
| `src/server/api/action.ts`, `hospital/waste/new/actions.ts`, `src/server/outbox/dispatcher.ts` | changed | `log.error(message, error, context)` argument order (the context was passed as the error and logged as "[object Object]") |

## 3.12 End-to-end pickup — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `tests/e2e/helpers.ts` | created | shared `asRole`, `certificateToken`, `testDb` (direct queries on the `test` branch) — moved out of `routes.spec.ts` |
| `tests/e2e/pickup.spec.ts` | created | 4 tests with fresh fixtures per run: driver UI (arrive, type both container codes, wrong code refused with attempts left, right code → "Handover confirmed (OTP)", DB = COLLECTED / OTP); HTTP API (no key 400, double tap = same response + one OTP, incomplete scans 409, EFDA 403, skip → waste REGISTERED); hospital UI (truck at the door, 2 of 2, confirm in the app → COLLECTED / IN_APP); admin screens of Gate 3 render |
| `tests/e2e/routes.spec.ts` | changed | uses `helpers.ts` |

## Fix: tests must not depend on the test branch staying in its seeded state — 10 Oct 2026

The first full run on the `test` branch failed 19 integration tests: the earlier e2e fixtures changed the seeded
demo trip (skipped its ARRIVED stop), committed test fixtures add facilities, trips and messages that stay, and
"today's trip" checks assumed the seed day. No product code was wrong.

| File | Action | Why |
|---|---|---|
| `src/server/auth/dev-session.ts`, `src/server/auth/current-user.ts` | changed | test-mode identities `e2e_…`: accepted ONLY when `DEV_AUTH_BYPASS=1` (the Playwright server); the session names its own `users.clerk_user_id`, role must match. Never on the owner's dev server or in production |
| `tests/unit/dev-session.test.ts` | changed | e2e identities refused without the test flag, accepted with it, role checked |
| `tests/e2e/helpers.ts` | changed | `asIdentity(page, clerkUserId, role)` |
| `tests/e2e/pickup.spec.ts` | rewritten | every test builds its own facility, hospital recipient, driver, vehicle, waste and trip; the driver starts the trip in the UI; seeded rows are never touched |
| `tests/integration/db.ts` | changed | test pool waits up to 120 s for a connection, max 20 (the 50-writer audit test) |
| `tests/integration/outbox.test.ts` | changed | drains other tests' pending messages before each test |
| `tests/integration/{admin,driver-disposal,hospital,regulator}-queries.test.ts`, `seed-data.test.ts` | changed | expectations computed from the database, or restricted to seeded rows (`DD-` facilities, `ET-` plates); fixture codes in the reserved period `99…` are excluded from the counter check; "ARRIVED stop has exactly one OTP" → at most one (arrival without recipients issues none — Gate 3 ASSUMPTION) |

Note: the seeded demo trip on the `test` branch was already changed by the earlier e2e run. Optional: in the Neon
console, Branches → test → "Reset from parent" restores it (the `dev` branch was never touched).

How to undo: restore the listed files from the pre-Gate-3 backup folder.
