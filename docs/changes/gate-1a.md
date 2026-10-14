# Change log — Gate 1a (tooling, route structure, mobile layout)

Started 7 Oct 2026. The project has no git; this file replaces commit history for Gate 1a.
Backup made by the owner before the gate: `neba-cs-backup-gate1a` (project folder copy).

## Changes

| Task | File | Action | Why |
|---|---|---|---|
| 1a.0 | `CLAUDE.md` | changed | npm instead of pnpm, no git + change logs, ESLint Strict, DECISION list for prototype fields, contract code, invoice due date |
| 1a.0 | `docs/build-plan.md` | changed | P0.1/P0.2 dropped, Gate 1a rewritten in the approved order, npm commands, decision fields added to Gate 2 tasks 2.1/2.3/2.10 |
| 1a.0 | `docs/frontend-audit.md` | changed | super_admin seeing invoices is correct (Appendix C), removed from M15; open questions marked DECIDED |
| 1a.0 | `docs/changes/gate-1a.md` | created | this change log |
| 1a.1 | `package.json`, `package-lock.json` | changed | dev deps `vitest@^3`, `prettier@^3`; scripts `test`, `test:watch`, `format`, `format:check` |
| 1a.1 | `.eslintrc.json` | created | Next.js Strict preset (`next/core-web-vitals` + `next/typescript`); `next lint` now runs non-interactively |
| 1a.1 | `.prettierrc.json`, `.prettierignore` | created | formatting rules (existing files not reformatted, to avoid a noise diff) |
| 1a.1 | `vitest.config.ts` | created | `@/` alias, `tests/unit/**/*.test.ts` |
| 1a.1 | `tests/unit/roles.test.ts` | created | sample test: exactly 6 roles, each to its own area |
| 1a.1 | `src/app/{admin,disposal,driver,hospital,pending,regulator}/page.tsx`, `src/app/verify/[token]/page.tsx` | changed | lint: removed unused imports; admin/hospital tab ids typed instead of `as any` |
| 1a.1 | `src/components/shared/{data-table,kpi-card,sidebar,header,facility-map}.tsx` | changed | lint: unused imports/variables removed; `any` replaced (`DataTable<T extends object>`, map pin typed `Vehicle \| TripStop`); unused map props `routeCoordinates/center/zoom` no longer destructured (still in the props type for Gate 4) |
| 1a.1 | `src/mock/{fleet,index}.ts`, `src/types/audit.ts` | changed | lint: unused imports/variable removed; `metadata` typed `Record<string, unknown>` |
| 1a.2 | `src/server/auth/session-provider.tsx` → `src/components/dev/dev-role-provider.tsx` | moved + changed | client code does not belong in `src/server`; renamed `AuthProvider`/`useAuthContext` → `DevRoleProvider`/`useDevSession`; exports `DEV_TOOLS_ENABLED` (`NODE_ENV === "development"`); in production `user`/`activeRole` are `null` and `switchRole` does nothing; storage access wrapped in try/catch |
| 1a.2 | `src/components/shared/role-switcher.tsx` → `src/components/dev/dev-role-switcher.tsx` | moved + changed | labelled "Dev role switcher" with a DEV tag; returns `null` outside development; opens on click (keyboard/touch) instead of hover only. Note: its code is still in the production JS bundle but never renders |
| 1a.2 | `src/components/dev/dev-session-gate.tsx` | created | `DevSessionGate` + `NoSession` ("No session — sign-in arrives in Gate 1b"); wired into area layouts in 1a.3 |
| 1a.2 | `src/server/auth/area-guard.ts` | created | `allowAreaPlaceholder(area)` allows everything, `TODO(Gate 1b)`; `AREA_ROLES` per area |
| 1a.2 | `src/server/auth/types.ts` | deleted (approved) | unused (`grep` found no importer) and inconsistent with the provider |
| 1a.2 | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/pending/page.tsx`, `src/app/hospital/page.tsx`, `src/components/shared/{header,sidebar}.tsx` | changed | use `useDevSession`; `/` → area of the dev role, or `/sign-in` without a session; header workspace pill and sidebar hidden without a session |
| 1a.2 | `src/app/sign-in/[[...sign-in]]/page.tsx` | changed | production text "Sign-in arrives in Gate 1b."; "Enter Demo Workstation" button only in development |
| 1a.3 | `src/app/{admin,hospital,regulator}` → `src/app/(desk)/…` | moved | route group with the sidebar shell; URLs unchanged |
| 1a.3 | `src/app/{driver,disposal}` → `src/app/(mobile)/…` | moved | route group with the mobile shell (no sidebar); URLs unchanged |
| 1a.3 | `src/app/{sign-in,verify}` → `src/app/(public)/…` | moved | public pages without sidebar or role switcher; URLs unchanged |
| 1a.3 | `src/app/layout.tsx` | changed | only `<html>/<body>` + `DevRoleProvider`; the sidebar/header shell moved to `(desk)/layout.tsx` |
| 1a.3 | `src/app/(desk)/layout.tsx`, `src/app/(mobile)/layout.tsx`, `src/app/(public)/layout.tsx` | created | group shells; desk + mobile wrap pages in `DevSessionGate` ("No session" in production) |
| 1a.3 | `src/app/(desk)/{admin,hospital,regulator}/layout.tsx`, `src/app/(mobile)/{driver,disposal}/layout.tsx` | created | one layout per area calling `allowAreaPlaceholder(area)` with `TODO(Gate 1b)` |
| 1a.3 | `src/components/mobile/mobile-top-bar.tsx` | created | compact header (brand, workspace name, dev switcher) for /driver and /disposal |
| 1a.3 | `src/app/finance/page.tsx` | changed | client redirect → server `redirect()`; target stays `/admin?tab=invoices` until `/admin/finance` exists (1a.4) |
| 1a.3 | `.next/types/` | deleted (generated) | stale Next build output pointing at the old page paths broke `tsc`; regenerated by `next build`. Not source |
| 1a.8 | `src/mock/{audit,categories,disposal,facilities,finance,fleet,trips,users,waste-records}.ts` → `src/mocks/data/*.ts` | moved | one folder for prototype data; content unchanged except the import path `../types` → `@/types` |
| 1a.8 | `src/mock/index.ts` | deleted (approved in plan) | its 5 `get…DashboardData` functions were replaced by the per-area mock functions below |
| 1a.8 | `src/mocks/{admin,hospital,driver,disposal,regulator,verify}.ts` | created | `getAdminDashboardMock()`, `getHospitalDashboardMock(facilityId)`, `getDriverDashboardMock(userId)`, `getDisposalDashboardMock()`, `getRegulatorDashboardMock(filters)`, `getVerifyMock(token)` return view-models; Gate 2 swaps them for `src/server/queries/*` |
| 1a.8 | `src/mocks/mappers.ts` | created | shared mapping prototype records → view-model rows; `MOCK_TODAY` |
| 1a.8 | `src/types/view-models/{shared,admin,hospital,driver,disposal,regulator,verify,index}.ts` | created | typed view-models from audit §4.2 (money in santim); prototype-only fields marked `@deprecated` (see table below); statuses still v1.1 until Gate 2 |
| 1a.8 | `src/lib/money.ts` | created | `etbToSantim`, `formatEtb` (en-US grouping, ≤ 2 decimals) — moved forward from 1b.2 |
| 1a.8 | `src/types/fleet.ts`, `src/mocks/data/fleet.ts` | changed | `Driver.userId` added; `drv-01.userId = "usr-04"` (mirrors `drivers.user_id`) so the driver page follows the dev user |
| 1a.8 | `src/app/(desk)/{admin,hospital,regulator}/page.tsx`, `src/app/(mobile)/{driver,disposal}/page.tsx`, `src/app/(public)/verify/[token]/page.tsx` | changed | read view-models from `src/mocks/*`; money via `formatEtb`; hospital: no `fac-01` fallback (ErrorState when the user has no facility); driver: no hard-coded `drv-01` and no fallback to another trip (ErrorState / EmptyState "No active trip") |
| 1a.8 | `src/components/shared/facility-map.tsx` | changed | props are `MapVehicle[]` / `MapStop[]` view-models |
| 1a.8 | `src/components/shared/data-table.tsx` | changed | optional `getSearchText(row)` for nested values (e.g. `row.facility.name`) |
| 1a.8 | `src/components/dev/dev-role-provider.tsx`, `src/server/auth/current-user.ts` | changed | import path `@/mocks/data/users` |
| 1a.8 | `tests/unit/money.test.ts`, `tests/unit/mocks.test.ts` | created | money conversion/format; facility scope + no fallback; driver = dev user; santim integers; exceptions; filters; no `@/mocks/data` import in `src/app` or `src/components/shared` |
| 1a.4 | `src/app/(desk)/admin/page.tsx` | changed (split) | was one 520-line client page with 6 `useState` tabs; now the server-rendered Overview (radar, category chart, today's trips) |
| 1a.4 | `src/app/(desk)/admin/{fleet,finance,contracts,categories,alerts}/page.tsx` | created | one route per former tab; markup moved unchanged |
| 1a.4 | `src/app/(desk)/admin/layout.tsx` | changed | renders the page header + KPI grid + link tabs for every /admin route (plus the guard placeholder) |
| 1a.4 | `src/components/admin/{admin-header,trips-table,category-chart,invoices-ledger,contracts-table}.tsx` | created | sections extracted from the old page; client only where needed (tables with render functions, chart, invoice filter state) |
| 1a.4 | `src/components/shared/area-tabs.tsx` | created | link-based pill tabs (active = current path; `aria-current`); replaces the copied tab bars. Inactive tabs now have the hover background on every area (admin/hospital already had it) |
| 1a.4 | `src/app/finance/page.tsx` | changed | `redirect("/admin/finance")` (CLAUDE.md §3) |
| 1a.5 | `src/app/(desk)/hospital/page.tsx` | changed (split) | now the Facility Overview only |
| 1a.5 | `src/app/(desk)/hospital/{waste,certificates,invoices}/page.tsx` | created | one route per former tab; `/hospital/invoices` shows an error state for roles that may not see invoices (the tab stays hidden for hospital_staff, as before) |
| 1a.5 | `src/app/(desk)/hospital/layout.tsx` | changed | renders `HospitalShell` (+ guard placeholder) |
| 1a.5 | `src/components/hospital/{hospital-shell,columns}.tsx` | created | shell = header, contact banner, KPIs, tabs and a context with the facility data; stays a client component in 1a because the facility comes from the dev user (Gate 2: server query) |
| 1a.5 | `src/app/(desk)/regulator/page.tsx` | changed (split) | now Volume Analytics only (server page) |
| 1a.5 | `src/app/(desk)/regulator/{audit,certificates,map}/page.tsx` | created | one route per former tab; `/regulator/audit` exists (CLAUDE.md §3) |
| 1a.5 | `src/app/(desk)/regulator/layout.tsx` | changed | header, filters + KPIs, tabs (tabs keep the filter query string) |
| 1a.5 | `src/components/regulator/{regulator-header,filters-kpis,tables,weekly-trend-chart}.tsx` | created | filters now live in the URL (`?facility=…&category=…`) instead of component state; as before they narrow only the volume KPIs |
| 1a.5 | `src/components/shared/area-tabs.tsx` | changed | Suspense boundary for `useSearchParams` moved inside the component (`keepSearch`) |
| 1a.5 | `src/app/(desk)/admin/layout.tsx` | changed | removed its own Suspense wrapper (now inside `AreaTabs`) |
| 1a.6 | `src/app/(mobile)/layout.tsx` | changed | `pb-24` so the fixed bottom navigation never covers content |
| 1a.6 | `src/components/mobile/bottom-nav.tsx` | created | fixed bottom nav, items ≥ 56 px tall, icon + label (+ count), `aria-current`, safe-area padding |
| 1a.6 | `src/app/(mobile)/driver/page.tsx` | changed (rewritten) | "Today": trip banner + one-column stop list; text ≥ 12 px; removed the misleading "(Tap cards to inspect details)" — cards were never clickable; `EmptyState` when no active trip |
| 1a.6 | `src/app/(mobile)/driver/upcoming/page.tsx` | created | former "Upcoming Routes" tab as its own route |
| 1a.6 | `src/app/(mobile)/driver/layout.tsx` | changed | renders `DriverShell` (+ guard placeholder) |
| 1a.6 | `src/components/driver/{driver-shell,stop-card}.tsx` | created | shell = compact driver summary + bottom nav (Today / Upcoming) + data context from the dev user; stop card is single-column at all widths |
| 1a.6 | `src/app/(mobile)/disposal/page.tsx` | changed (split) | now the destruction queue only (server page) |
| 1a.6 | `src/app/(mobile)/disposal/{inbound,exceptions}/page.tsx` | created | former tabs as routes |
| 1a.6 | `src/app/(mobile)/disposal/layout.tsx` | changed | plant header + KPIs (one column on a phone) + bottom nav (Queue / Inbound / Exceptions) |
| 1a.6 | `src/components/disposal/{disposal-header,disposal-nav,columns,container-lists}.tsx` | created | queue and exceptions render as cards below `md` and as the existing tables from `md` up (the card view has no search box) |
| 1a.6 | `src/components/dev/dev-role-switcher.tsx` | changed | label truncates on phones; menu never wider than the screen |
| 1a.7 | `src/components/shared/sidebar.tsx` | changed | links point to the sub-routes (the old `?tab=` links did nothing); active = exact path; driver "Stops Sequence" (no such view) removed; disposal "Disposal Yard" + "Destruction Queue" merged; regulator gets "Route Map"; hospital "Billing & Invoices" only for hospital_admin; "System Settings" link removed (no settings page); "Reset Session / Sign Out" → "Reset dev role", development only |
| 1a.7 | `src/components/shared/header.tsx` | changed | removed the search box and the theme, notifications and settings buttons (no behaviour behind them); keeps the workspace pill and the dev switcher |
| 1a.9 | `package.json`, `package-lock.json` | changed | dev dep `@playwright/test`; script `test:e2e` (`playwright test`); Chromium downloaded to the user's ms-playwright cache (outside the project) |
| 1a.9 | `playwright.config.ts` | created | runs against `next dev` on port 3100 (dashboards are dev-only until Gate 1b) |
| 1a.9 | `tests/e2e/routes.spec.ts` | created | 41 tests: every route per dev role, `/` → area per role, no silent fallbacks, public/redirect routes, regulator filters in the URL, 360 px checks (no horizontal scroll, nav targets ≥ 48 px) |
| 1a.9 | `.prettierignore` | changed | ignore `test-results`, `playwright-report` |

## To remove in Gate 2

Prototype-only display fields that are kept as optional `@deprecated` view-model fields so the screens stay identical in
Gate 1a. Each must be removed (field + UI) in Gate 2 when the schema and statuses are introduced.

| Field (view-model) | Shown where | Reason to remove |
|---|---|---|
| `HospitalFacility.authorizedContactName` | /hospital header "Authorized EHO" | no authorized contact in v1.2 (OTP goes to verified hospital users) |
| `HospitalFacility.hasIncompleteContact` | /hospital "Incomplete contact" banner | replaced by "facility not ready" |
| `AdminAlerts.facilitiesMissingContact` | /admin alerts "Facilities missing authorized contact" | replaced by "facilities not ready" |
| `StopCard.contactName`, `StopCard.contactPhone` | /driver stop cards "Authorized Contact" | no authorized contact in v1.2 |
| `StopCard.plannedArrivalLabel`, `StopCard.actualArrivalLabel` | /driver stop cards "Schedule & ETA" | display strings; v1.2 stores `arrived_at` only |
| `StopCard.overrideUsed` | /driver "Handover OTP Override Logged" | replaced by `collectionMethod` (OTP / IN_APP / OVERRIDE) |
| `DriverTrip.startTimeLabel` | /driver upcoming trips | display string, not stored in V1 |
| `QueueContainer.barcode` | /disposal queue "Barcode" | QR holds the container code; no barcode |
| `QueueContainer.weightKg` | /disposal queue "Payload" | weight is per waste record, not per container |
| `ContractRow.ratePerKgSantim` | /admin contracts "Rate / Kg" | contracts have a monthly fee only |
| `InvoiceRow.billedKg` | /admin invoices "Billed Volume" | weight is recorded, not billed |
| `MapVehicle.batteryLevel` | map pin drawer "Battery" | dropped (decision 7 Oct 2026) |
| `VerifyResult.operatorName` | /verify "Authorized Plant Operator" | no person names on the public page |
| `VerifyResult.witnessName` | /verify "Regulatory Witness" | witness dropped (decision 7 Oct 2026) |
| UI text "INCINERATOR STATUS: 1150°C" (not a field) | /disposal header badge | temperature dropped (decision 7 Oct 2026) |
| UI text "sealed bins" (not a field) | /disposal inbound trucks | no sealing step in v1.2 |
| Behaviour: unknown verify token → first certificate | `src/mocks/verify.ts` | must show "not found" (Gate 5) |

## Result (7 Oct 2026)

- `npm run typecheck` ✔ · `npm run lint` ✔ (no warnings) · `npm run test` ✔ 10/10 · `npm run test:e2e` ✔ 41/41 · `npm run build` ✔ 25 pages.
- Production build probed with `next start`: `/admin`, `/driver`, `/hospital` show "No session"; `/sign-in` says
  "Sign-in arrives in Gate 1b"; no dev switcher rendered; `/finance` → 307 to `/admin/finance`.
- Known leftovers (not in the approved 1a scope): `/verify` and `/pending` still link to `/admin` (audit M20);
  the dev switcher's code is in the production bundle but never renders; dates still use the browser's locale
  (`src/lib/dates.ts` is task 1b.2).

## How to undo

There is no git. To undo Gate 1a completely, close the editor and dev server, delete the project folder (keep `docs/`
changes if wanted) and restore the backup copy `neba-cs-backup-gate1a`. To undo a single task, use the table above:
files marked "created" can be deleted, "moved from → to" can be moved back, and "changed" files must be restored
from the backup copy.
