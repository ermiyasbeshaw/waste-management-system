# Change log — Gate 1b (foundation: env, database, Clerk)

Started 7 Oct 2026. No git; this file replaces commit history for Gate 1b. Secret values are never written here.

## External setup (done in the browser, approved by the owner)

| Step | Where | What | Notes |
|---|---|---|---|
| S1 | Neon | Project **safewaste** created, region **AWS Europe Central 1 (Frankfurt)**, Postgres 18 | free plan; closest region to Ethiopia |
| S2 | Neon | Branch **dev** created from `production`, auto-delete **Never** | Neon's default was "after 1 day" — changed |
| S3 | Neon | Password of role `neondb_owner` **reset on `dev` and `production`** | the first `dev` password was printed in the chat by mistake (masking command failed in PowerShell 5.1); both branches shared it, so both were rotated |
| S4 | `.env.local` | `DATABASE_URL` (pooled, `-pooler` host) and `DATABASE_URL_UNPOOLED` (direct host) for branch `dev` | written from the clipboard by a script; values never displayed after S3; verified: both connect (`neondb`, `neondb_owner`, Postgres 18.6) |
| S5 | Clerk | Application **SafeWaste** created (Development instance): sign-in with email + phone number; Google sign-in off | |
| S6 | Clerk | Access mode **Invite-only** (public sign-up disabled) | CLAUDE.md §4 |
| S7 | `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (test keys) | verified: Clerk Backend API returns HTTP 200 |

The production Neon password is not stored anywhere; take it from Neon when production is configured.

## Findings that need a decision

- **Clerk "Phone numbers" and "SMS code (MFA)" are Pro-plan features.** Free on the Development instance; a production
  instance with phone verification needs Clerk Pro (paid, USD). The architecture depends on Clerk-verified phones for
  pickup OTP recipients (CLAUDE.md §4/§6). Client decision needed before go-live (alternative in architecture §15:
  verify numbers with a test SMS through Ethio Telecom).
- `CLERK_WEBHOOK_SECRET` is not set yet: the webhook needs a public URL (tunnel or deployed staging). Planned in 1b.8.

## Changes

| Task | File | Action | Why |
|---|---|---|---|
| setup | `.env.local` | changed | Neon + Clerk values (see S4, S7) — not committed anywhere, no git |
| setup | `package.json`, `package-lock.json` | changed | dependency `@neondatabase/serverless` (planned for 1b.3) |
| 1b.1 | `package.json`, `package-lock.json` | changed | dependency `server-only` |
| 1b.1 | `src/lib/env-schema.ts` | created | pure zod rules: secrets required (no defaults), placeholders refused (`…placeholder…`), formats checked (postgres URL, `sk_`/`pk_` prefixes, `whsec_`, CRON_SECRET ≥ 32 chars), `APP_BASE_URL` required in production (default `http://localhost:3000` otherwise); errors list variable names only, never values |
| 1b.1 | `src/env.ts` | changed (rewritten) | `import "server-only"`; `env = parseEnv(process.env)` — the old version had defaults for every secret, so it could never fail |
| 1b.1 | `src/app/layout.tsx` | changed | `import "@/env"` so `next dev` / `next build` fail fast on bad config (verified: build stopped with "APP_BASE_URL is required in production") |
| 1b.1 | `.env.example` | changed (rewritten) | every variable, empty secrets, comments on where to find each value; `NODE_ENV` removed (Next sets it) |
| 1b.1 | `.env.local` | changed | `CRON_SECRET` replaced by a random 64-char value (old 15-char dev value fails the new rule); `APP_BASE_URL=http://localhost:3000` added for local production builds |
| 1b.1 | `tests/unit/env.test.ts` | created | 7 tests: valid config, each missing secret reported, empty = missing, placeholders refused, formats, production APP_BASE_URL, no values in messages |

Note (1b.1): running `npm run build` while `npm run dev` is running breaks the dev server (both use `.next/`; dev then fails with
"Cannot find module './vendor-chunks/…'"). Restart dev after a build. Task 1b.9 will make `npm run check` warn about this.
| 1b.2 | `src/server/errors.ts` | created | `AppError(code, httpStatus?, message?, details?)` with default statuses (401/403/404/409 INVALID_TRANSITION/422/429/500); `toErrorBody()` → `{ error: { code, message, details } }`; zod errors → 422 with per-field messages; unknown errors → generic 500 (no internal text leaks); `errorResponse()` for Route Handlers |
| 1b.2 | `src/lib/dates.ts` | created | EAT (Africa/Addis_Ababa) formatting: `formatDate` "7 Oct 2026", `formatTime` "14:05", `formatDateTime`, `toEatDateString`, `eatMonthRange` (month boundaries at EAT midnight, for invoices/KPIs), `daysBetween` |
| 1b.2 | `src/lib/redact.ts` | created | `maskPhone` ("+2519******20"), `redact()` removes OTP/hash/token/password/secret/authorization/cookie/session values by key and scrubs DB URLs, Clerk keys, webhook secrets, bearer tokens and phone numbers in free text |
| 1b.2 | `src/server/log.ts` | created | server-only JSON logger (`log.info/warn/error`, request ID, user, role) — every field goes through `redact`; `newRequestId()` |
| 1b.2 | `tests/unit/helpers.test.ts` | created | 11 tests: EAT formatting, month boundaries (incl. Dec→Jan), phone masking, redaction by key and in text, error format, zod → 422, generic 500. Caught a real gap: camelCase `codeHash` was not redacted — fixed |

Checks after 1b.2: typecheck ✔ · lint ✔ · unit 28/28 ✔ · e2e 41/41 ✔ · build ✔ (25 pages).
Not yet done: existing screens still format dates with the browser's locale; they switch to `src/lib/dates.ts` when they read real ISO timestamps from the database (Gate 2).
| check | `.env.local` | changed | `CRON_SECRET` regenerated again: a key listing printed its first 8 characters in chat |
| check | `.gitignore` | created | protects `.env*` (except `.env.example`), `.next/`, `node_modules/`, test output — in case the project is ever put under git |

Credential check (7 Oct 2026): `.env.local` holds all 12 variables; it passes `parseEnv` in development and production
modes; live tests: `DATABASE_URL` ✔, `DATABASE_URL_UNPOOLED` ✔ (Postgres 18.6), `CLERK_SECRET_KEY` ✔ (HTTP 200).
The first database attempt failed with "fetch failed" and the retry succeeded — Neon free plan suspends idle compute;
1b.3 adds a retry to the database client. Backups made by copying the project folder now contain real secrets: keep them private.
| 1b.3 | `package.json`, `package-lock.json` | changed | `drizzle-orm` 0.45, dev: `drizzle-kit` 0.31, `dotenv`, `tsx`; scripts `db:generate`, `db:migrate`, `db:studio`, `test:integration` |
| 1b.3 | `drizzle.config.ts` | created | loads `.env.local`; migrations use the direct (unpooled) URL; output `drizzle/` |
| 1b.3 | `src/server/db/schema/{enums,facilities,users,index}.ts` | created | enums `user_role`, `facility_type`, `facility_status`; `facilities` (§6.2 + optional city/sub_city/woreda/kebele); `users` (§6.2). UUID v7 ids via Postgres 18 `uuidv7()`; `timestamptz`; FK `ON DELETE RESTRICT`; CHECKs: facility by role, OTP recipient rules, E.164 phone, verified-needs-phone, lowercase unique email, unique Clerk id, facility code format, lat/lng ranges |
| 1b.3 | `src/server/db/client.ts` | created | server-only Drizzle client on Neon's WebSocket `Pool` (supports interactive transactions for the Workflow Engine); one pool reused across dev hot reloads |
| 1b.3 | `src/server/db/retry.ts` | created | `withDbRetry()` for READ-ONLY calls: retries network errors only (Neon waking up), never SQL errors, never writes |
| 1b.3 | `drizzle/0000_init_users_facilities.sql` | created (generated) + applied to `dev` | enums, tables, constraints, indexes |
| 1b.3 | `drizzle/0001_users_facility_type_and_updated_at.sql` | created (custom) + applied to `dev` | triggers: disposal_operator ↔ DISPOSAL_SITE and hospital roles ↔ non-disposal facility; facility type locked while users belong to it; `updated_at` maintained on UPDATE |
| 1b.3 | `drizzle/0002_fix_null_role_checks.sql` | created (generated) + applied to `dev` | **bug found by the integration tests:** a user with NO role passed both CHECKs (NULL `IN (...)` is "unknown" and CHECK accepts unknown) — could have a facility or be an OTP recipient. Constraints now test `role IS NOT NULL` explicitly |
| 1b.3 | `vitest.integration.config.ts`, `tests/integration/{setup-env,db,users-facilities.test}.ts` | created | 9 tests against Neon `dev`, each inside a rolled-back transaction (dev stays empty: 0 users, 0 facilities after the run) |
| 1b.3 | `tests/unit/db-retry.test.ts` | created | 4 tests: retries network errors, not SQL errors, gives up, sees wrapped causes |

Checks after 1b.3: typecheck ✔ · lint ✔ · unit 32/32 ✔ · integration 9/9 ✔ · e2e 41/41 ✔ · build ✔.
Neon `dev` now has 3 migrations; `production` is untouched (no tables).
| 1b.4 | `src/middleware.ts` | created | Clerk `clerkMiddleware`: public routes `/`, `/sign-in`, `/verify/*`, `/api/health`, `/api/verify/*`, `/api/webhooks/clerk`, `/api/tracking/v1/ingest`, `/api/jobs/*`; every other route requires a session (`auth.protect()`: page loads → redirect to `/sign-in?redirect_url=…`, other requests → 404) |
| 1b.4 | `src/server/auth/dev-bypass.ts` | created | development-only test bypass: needs NODE_ENV=development AND server flag `DEV_AUTH_BYPASS=1` AND localhost AND header `x-dev-auth-bypass: 1`. Lets Playwright test dashboards without signing in through Clerk (an external identity provider) |
| 1b.4 | `src/server/auth/clerk-ui.tsx` | created | `SignInPanel` (Clerk `<SignIn/>`, dark appearance) and `AccountMenu` (`<UserButton/>` with sign-out) — wrappers so all `@clerk/*` imports stay in `src/server/auth/` (CLAUDE.md §2) |
| 1b.4 | `src/app/layout.tsx` | changed | wrapped in `<ClerkProvider>` (identity only) |
| 1b.4 | `src/app/(public)/sign-in/[[...sign-in]]/page.tsx` | changed (rewritten) | real Clerk sign-in; demo button and placeholder text removed; "access is by invitation only" note |
| 1b.4 | `src/components/shared/header.tsx`, `src/components/mobile/mobile-top-bar.tsx` | changed | Clerk account menu (sign out) next to the dev switcher |
| 1b.4 | `src/components/dev/dev-role-provider.tsx` | changed | removed unused `isClerkConfigured` |
| 1b.4 | `src/lib/env-schema.ts` | changed | `DEV_AUTH_BYPASS` ("0"/"1", optional), refused in production |
| 1b.4 | `playwright.config.ts` | changed | test server always fresh (`reuseExistingServer: false`) with `DEV_AUTH_BYPASS=1`; every request sends the bypass header |
| 1b.4 | `tests/e2e/routes.spec.ts` | changed | +3 tests without the bypass header: signed-out `/admin` → `/sign-in` (real Clerk), unknown API route not 200, `/verify` stays public |
| 1b.4 | `tests/unit/env.test.ts`, `tests/unit/dev-bypass.test.ts` | changed / created | bypass refused in production; bypass only with all four conditions |

Checks after 1b.4: typecheck ✔ · lint ✔ · unit 36/36 ✔ · integration 9/9 ✔ · e2e 44/44 ✔ · build ✔ (middleware 78.7 kB).
Manual check in Chrome on the dev server (no bypass): `/admin` signed out → `/sign-in?redirect_url=/admin`, Clerk form with email + phone, "Development mode", no sign-up link.
Until 1b.5, a signed-in user still sees the mock dashboards chosen with the dev role switcher; roles are not read from the database yet.

## Clerk application switched (8 Oct 2026)

| Task | File | Action | Why |
|---|---|---|---|
| setup | `.env.local` | changed | owner supplied keys for a different Clerk Development app (`ace-malamute-8202`); replaced the `robust-leopard-6633` keys. Verified: secret key → HTTP 200; sign-in page loads the new app; signed-out `/admin` → 307 to `/sign-in` |

Notes:
- The new app has **0 users**. Settings applied earlier (invite-only, phone sign-in, Google off) were made on the OLD app
  (`robust-leopard-6633`) and must be checked on the new one.
- The new secret key was pasted into the chat — roll it in Clerk (Configure → API keys) and update `.env.local`
  (CLAUDE.md: rotate any secret shared in chat).
| setup | `scripts/create-test-users.mjs`, `package.json` | created / changed | `npm run users:create-test` (run by the owner): creates the six test users in the Clerk Development app with username + shared test password (read from docs/test-users.md, never printed), skips existing emails, refuses `sk_live_` keys, writes username/email/role/route/Clerk id into docs/test-users.md |
| setup | `docs/test-users.md` | changed | test password (dev only), usernames, planned routes per role |

## R0 — dev login without Clerk (8 Oct 2026)

DECISION (owner, 8 Oct 2026): build the role features and backend first; create Clerk users, webhook and phone
verification LAST. Until then the local dev server skips Clerk and the dev role switcher selects a seeded user;
every role check still runs on the server against the `users` table.

| Task | File | Action | Why |
|---|---|---|---|
| R0 | `src/server/auth/dev-bypass.ts` | changed | modes `1` (header, Playwright) and `always` (owner's dev server); localhost + development only; shared `devBypassApplies()` used by middleware and server code; cookie name `sw_dev_role` |
| R0 | `src/lib/env-schema.ts` | changed | `DEV_AUTH_BYPASS` accepts `always`; any bypass mode refused in production |
| R0 | `.env.development.local` | created | `DEV_AUTH_BYPASS=always` — loaded by `next dev` only, so `next build` / production never see it (first attempt put it in `.env.local`; the build then correctly refused it) |
| R0 | `scripts/seed.ts`, `package.json` | created / changed | `npm run db:seed`: 3 facilities (DD-REF-001, DD-GEN-002, DD-DIS-018) + 6 dev users `dev_<role>`; idempotent upserts; refuses NODE_ENV=production. Applied to Neon `dev` |
| R0 | `src/server/auth/access-rules.ts` | created | pure rules: roles, area → roles, home per role, `checkRole` (401/403), `checkFacilityScope` (hospital roles + disposal_operator), `areaDecision` |
| R0 | `src/server/auth/current-user.ts` | changed (rewritten) | real `getCurrentUser()` (React `cache`): dev cookie → `dev_<role>` row, otherwise Clerk `auth()` → `users` row; `requireRole(...roles)`, `requireFacilityScope()`; old mock-based helpers removed |
| R0 | `src/server/auth/area-guard.ts` | changed | `allowAreaPlaceholder` replaced by `requireAreaAccess(area)`: no access → `/pending`, other role → its own area |
| R0 | `src/app/(desk)/{admin,hospital,regulator}/layout.tsx`, `src/app/(mobile)/{driver,disposal}/layout.tsx` | changed | call `requireAreaAccess` |
| R0 | `src/app/(desk)/layout.tsx`, `src/app/(mobile)/layout.tsx` | changed | client-side `DevSessionGate` removed (the server guard replaces it) |
| R0 | `src/app/layout.tsx` | changed | async; passes the server's role and bypass state to the client provider; `ClerkProvider` moved inside `<body>` (Clerk recommendation) |
| R0 | `src/app/page.tsx` | changed (rewritten) | server redirect: role → its area; no session → `/sign-in` (or `/pending` in dev bypass); no access → `/pending` |
| R0 | `src/app/pending/page.tsx` | changed (rewritten) | server page; dev bypass: "pick a role" + switcher; otherwise "no access yet" + account menu |
| R0 | `src/components/dev/dev-role-provider.tsx`, `dev-role-switcher.tsx`, `src/components/shared/sidebar.tsx` | changed | role comes from the server; switching writes the `sw_dev_role` cookie and refreshes; localStorage no longer used; switcher only visible while the bypass is active |
| R0 | `tests/unit/access-rules.test.ts` | created | 9 tests incl. every role × every area, efda refused by write guards, facility scope |
| R0 | `tests/unit/dev-bypass.test.ts`, `tests/unit/env.test.ts` | changed | `always` mode, never in production |
| R0 | `tests/integration/seed-users.test.ts` | created | one active `dev_<role>` user per role with the right facility type; hospital users are OTP recipients |
| R0 | `tests/e2e/routes.spec.ts` | changed | role via cookie; area-guard tests; switcher test; 6 × 5 permission matrix |

Checks after R0: typecheck ✔ · lint ✔ · unit 48/48 ✔ · integration 10/10 ✔ · e2e 53/53 ✔ · build ✔.
Manual check (curl, dev server): no role → `/pending`; each role → its own area; any other area → redirected home.
Unused now (deletion needs approval): `src/components/dev/dev-session-gate.tsx`.

## R1 — dashboard test logins (username + password) and server-side data seam (8 Oct 2026)

Owner request: every dashboard has its own username and password, route- and role-based, without touching Clerk;
connect all pages and make them ready for the database (no backend business logic yet).

| Task | File | Action | Why |
|---|---|---|---|
| R1 | `scripts/generate-dev-accounts.mjs`, `package.json` | created / changed | `npm run dev:accounts`: one test login per role; writes scrypt hashes to `src/server/auth/dev-accounts.generated.ts`, plain passwords to `docs/test-users.md`, `DEV_LOGIN_SECRET` to `.env.development.local`; prints nothing secret |
| R1 | `src/server/auth/dev-accounts.generated.ts` | created (generated) | usernames, roles, salts, hashes — no plain passwords |
| R1 | `src/server/auth/dev-session.ts` | created | constant-time scrypt password check; HMAC-signed 12 h session cookie `sw_dev_session` (tamper, expiry and stale-account checks) |
| R1 | `src/server/auth/dev-login-actions.ts` | created | server actions `devLogin` (zod-validated, 5 wrong tries → 1 min lock per username, logs without passwords) and `devLogout`; refused unless the dev bypass is active |
| R1 | `src/app/(public)/dev-login/page.tsx`, `src/components/dev/dev-login-form.tsx` | created | `/dev-login` (404 unless dev bypass); username + password form; redirects to the role's dashboard |
| R1 | `src/components/dev/dev-account-menu.tsx` | created | "TEST username" badge + Sign out in header, mobile top bar, sidebar, /pending |
| R1 | `src/components/dev/dev-role-switcher.tsx` | changed | deprecated alias; choosing a role without a password is no longer possible (deletion needs approval) |
| R1 | `src/server/auth/current-user.ts`, `dev-bypass.ts`, `access-rules.ts`, `area-guard.ts`, `src/app/page.tsx`, `src/app/pending/page.tsx`, `src/middleware.ts`, `src/lib/env-schema.ts` | changed | identity = verified test-login session (dev) or Clerk; no identity → `/dev-login` (dev) / `/sign-in`; `/dev-login` public; `DEV_LOGIN_SECRET` validated |
| R1 | `src/components/dev/dev-role-provider.tsx`, `src/app/layout.tsx`, `src/components/shared/sidebar.tsx` | changed | name and role come from the server (`users` row); no mock profile in the browser |
| R1 | `src/server/queries/{admin,hospital,driver,disposal,regulator,verify}.ts`, `_mock-bridge.ts` | created | **data seam**: every page reads through a server query that starts with `requireRole` (hospital = own facility, driver = own trips). They return the mock view-models today; Gate 2 replaces only these files with SQL |
| R1 | admin, disposal, hospital, driver, regulator layouts/pages; `src/app/(public)/verify/[token]/page.tsx` | changed | load data on the server via the queries; hospital/driver shells receive data as props; verify page is a server page |
| R1 | `src/components/regulator/{filters-kpis,regulator-scope}.tsx` | changed / created | filter bar only changes the URL; KPIs are loaded on the server per filter (block lives in the pages because layouts do not re-render on query changes) |
| R1 | `tests/unit/{dev-session,access-rules,mocks}.test.ts`, `tests/e2e/routes.spec.ts` | created / changed | password + cookie tests; "no page/component imports mocks"; "every query calls requireRole"; e2e logs in with each username + password, wrong password, sign out, forged cookie |

Checks after R1: typecheck ✔ · lint ✔ · unit 56/56 ✔ · integration 10/10 ✔ · e2e 60/60 ✔ · build ✔ (26 pages).
Visible change: the sidebar role line shows the role name (e.g. "Super Administrator") instead of the prototype's job title.
Unused, deletion needs approval: `src/components/dev/dev-session-gate.tsx`, `src/components/dev/dev-role-switcher.tsx`.

## Postponed tasks done without Clerk accounts — 10 Oct 2026

The owner decided Clerk users come last. These parts need no Clerk account and were built at the end of Gate 7.

| Task | File | Action | Why |
|---|---|---|---|
| 1b.7 | `scripts/user-assign.ts`, `package.json` | created / changed | `npm run user:assign -- --clerk-id … --role … [--facility …] [--name … --email …] [--otp-recipient] [--deactivate]`: links a Clerk user to a `users` row; facility rules checked (and enforced by the database); audited on the same hash chain (`user.role_assigned` / `user.role_changed`, request `cli:user-assign`). Tested on the `test` branch: create, change, three refusals; chain verified intact afterwards |
| 1b.8 | `src/server/auth/clerk-webhook.ts` | created | Svix signature check (HMAC-SHA256, 5-minute window, constant time) and user event parsing, no extra dependency |
| 1b.8 | `src/server/services/users.ts` | created | `syncClerkUser`: primary email, primary phone and its verification onto the user's row; an unverified phone stops pickup codes; `user.deleted` deactivates; unknown Clerk users ignored (invitation only); audited with the phone masked |
| 1b.8 | `src/app/api/webhooks/clerk/route.ts` | created | `POST /api/webhooks/clerk` (public route, signature required; 503 until `CLERK_WEBHOOK_SECRET` is set) |
| 1b.8 | `tests/unit/clerk-webhook.test.ts`, `tests/integration/clerk-sync.test.ts` | created | 4 + 2 tests |
| 1b.9 | `src/app/api/health/route.ts`, `package.json` | created / changed | health endpoint (see gate-7.md); `npm run check` = lint → typecheck → test → build |

Still open (owner, last): create the Clerk users, configure the webhook in the Clerk dashboard (events
user.created / user.updated / user.deleted), run `user:assign` for each person, test +251 phone verification
(CLAUDE.md §11), then turn the development bypass off (remove `.env.development.local`).
