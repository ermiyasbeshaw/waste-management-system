# Frontend Audit — Neba CS / SafeWaste

Date: 7 Oct 2026 · Scope: read-only audit of the existing frontend against `CLAUDE.md` and
`docs/architecture-v1.2.pdf` (v1.2 implementation baseline). No source file was changed.

**Summary in five lines**

1. The prototype is a **display-only** set of six dashboards. It has **no forms and no action buttons**
   (no waste registration, no scan, no OTP entry, no destruction, no invoice actions). Most of the work is new UI,
   not wiring.
2. Each role **already has its own route** (`/admin`, `/hospital`, `/driver`, `/disposal`, `/regulator`), but there is no
   access control. The role comes from a client-side context saved in `localStorage`, and any role can open any page.
3. Every page is a Client Component that calls a synchronous mock function from `src/mock/index.ts`.
4. All status names, code formats and several data fields follow **v1.1 or earlier**. They do not match v1.2.
5. Typecheck and build pass. Lint cannot run (no ESLint config), and the "map" is a CSS mock without Leaflet.

---

## Step 1 — Project inventory

### 1.1 Framework and libraries (`package.json`)

| Item | Found | Required by CLAUDE.md | Gap |
|---|---|---|---|
| Next.js | `14.2.25` (App Router) | 14.2 App Router | OK |
| React / React DOM | `^18.3.1` | 18 | OK |
| TypeScript | `^5.7.3`, `"strict": true` in `tsconfig.json` | strict | OK |
| Tailwind CSS | `^3.4.17` (+ postcss, autoprefixer) | yes | OK |
| shadcn/ui | **not installed** (no `components.json`, no `src/components/ui/`) | yes | Missing. Custom components in `src/components/shared/` instead |
| Recharts | `^2.15.1` | yes | OK |
| TanStack Table | **not installed** | yes | Missing. Hand-written `DataTable` |
| react-hook-form | **not installed** | yes | Missing (there are no forms yet) |
| zod | `^3.24.2` | yes | Used only in `src/env.ts` |
| Leaflet | `leaflet ^1.9.4`, `@types/leaflet` | Leaflet + react-leaflet | **react-leaflet missing**; Leaflet is installed but **never imported** |
| Clerk | `@clerk/nextjs ^6.12.0` | Clerk | Installed but **never imported** anywhere |
| Drizzle / Neon / pg | **not installed** | yes | Missing |
| Vitest / Playwright | **not installed** | yes | Missing; no `tests/` folder |
| Other | `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `date-fns` | — | `date-fns` installed but dates are formatted with `toLocale*` |

**Package manager:** `package-lock.json` is present, so the project was installed with **npm**. pnpm is **not installed**
on this machine (`which pnpm` → not found), and there is no `pnpm-lock.yaml`. CLAUDE.md requires pnpm.

**Scripts:** `dev`, `build`, `start`, `lint` (`next lint`), `typecheck` (`tsc --noEmit`).
Missing compared with CLAUDE.md: `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `user:assign`.

### 1.2 Router and folder tree

App Router (`src/app`). There is no `middleware.ts`.

```
src/
  app/
    layout.tsx                 root layout: AuthProvider (mock) + Sidebar + Header
    page.tsx                   client redirect to the active role's defaultPath
    globals.css
    admin/page.tsx             Super Admin dashboard (521 lines)
    hospital/page.tsx          Hospital Admin + Staff dashboard (308 lines)
    driver/page.tsx            Driver console (266 lines)
    disposal/page.tsx          Disposal Operator dashboard (253 lines)
    regulator/page.tsx         EFDA dashboard (361 lines)
    finance/page.tsx           client redirect → /admin?tab=invoices
    pending/page.tsx           "pending role assignment" page
    sign-in/[[...sign-in]]/page.tsx   placeholder (no Clerk component)
    verify/[token]/page.tsx    public certificate page (mock)
  components/shared/
    data-table.tsx  empty-state.tsx  error-state.tsx  facility-map.tsx  header.tsx
    kpi-card.tsx  page-header.tsx  role-switcher.tsx  sidebar.tsx  status-badge.tsx
  mock/
    index.ts (5 dashboard "query" functions)  audit.ts  categories.ts  disposal.ts  facilities.ts
    finance.ts  fleet.ts  trips.ts  users.ts  waste-records.ts
  server/auth/
    current-user.ts  session-provider.tsx ("use client")  types.ts
  types/
    index.ts  audit.ts  auth.ts  disposal.ts  facility.ts  finance.ts  fleet.ts  waste.ts
  env.ts
docs/
  dashboards.md  architecture-v1.2.pdf  (this file, build-plan.md)
```

### 1.3 How role switching works today

| Piece | File | What it does |
|---|---|---|
| State | `src/server/auth/session-provider.tsx` | `"use client"` React context `AuthContext` with `activeRole` + `user` (from `MOCK_USERS`). Persists the role in `localStorage["safewaste_active_role"]`. Exposes `switchRole()` and `isClerkConfigured` (true when the publishable key is not the placeholder). |
| Provider | `src/app/layout.tsx` | Wraps the whole app in `<AuthProvider>`. |
| Picker | `src/components/shared/role-switcher.tsx` | Hover menu in the header. Calls `switchRole(role)` and `router.push(ROLE_CONFIGS[role].defaultPath)`. |
| Role table | `src/types/auth.ts` → `ROLE_CONFIGS` | Label, workspace name, `defaultPath`, accent colours per role. |

**Every place that reads the role context (`useAuthContext`)**

| File | Uses |
|---|---|
| `src/app/page.tsx` | `activeRole` → redirect |
| `src/app/hospital/page.tsx` | `user.facilityId` (fallback `"fac-01"`), `activeRole` → shows invoice tab for `hospital_admin` or `super_admin` (correct per Appendix C) |
| `src/app/pending/page.tsx` | `user.fullName` |
| `src/app/sign-in/[[...sign-in]]/page.tsx` | `isClerkConfigured` |
| `src/components/shared/sidebar.tsx` | `user`, `activeRole` (nav links), `switchRole("super_admin")` as "Sign Out" |
| `src/components/shared/header.tsx` | `activeRole`, `user` |
| `src/components/shared/role-switcher.tsx` | `activeRole`, `switchRole` |

`src/server/auth/current-user.ts` has `getCurrentUser`, `requireRole` and `requireFacilityScope`, but **nothing calls them**.
`requireRole` takes the role as a parameter and returns a boolean instead of throwing, so it cannot protect anything.
`src/server/auth/types.ts` declares `AuthContextType.setRole`, but the provider exposes `switchRole` (unused, inconsistent type).

### 1.4 Mock data

| File | Exports | Shape (type in `src/types`) | Size |
|---|---|---|---|
| `mock/facilities.ts` | `MOCK_FACILITIES` | `Facility` (incl. authorized contact fields) | 18 facilities (17 health + disposal site `fac-18`) |
| `mock/categories.ts` | `MOCK_WASTE_CATEGORIES` | `WasteCategory` | 6 MoH categories |
| `mock/fleet.ts` | `MOCK_DRIVERS`, `MOCK_VEHICLES` | `Driver`, `Vehicle` | 2 + 2 (one vehicle MAINTENANCE / no tracker) |
| `mock/trips.ts` | `MOCK_TRIPS` | `Trip` with nested `TripStop[]` | 3 trips (COMPLETED, IN_PROGRESS, PLANNED) |
| `mock/waste-records.ts` | `MOCK_WASTE_RECORDS`, `MOCK_CONTAINERS` | `WasteRecord`, `WasteContainer` | ~14 records, ~8 containers |
| `mock/finance.ts` | `MOCK_INVOICES`, `MOCK_CONTRACTS` | `Invoice`, `Contract` | 6 invoices, 4 contracts |
| `mock/disposal.ts` | `MOCK_CERTIFICATES`, `MOCK_DESTRUCTION_RECORDS` | `DisposalCertificate`, `DestructionRecord` | 4 certificates (1 REVOKED) |
| `mock/audit.ts` | `MOCK_AUDIT_LOGS`, `MOCK_SETTINGS` | `AuditLog`, `SystemSettings` | ~10 log rows |
| `mock/users.ts` | `MOCK_USERS` | `Record<role, UserProfile>` | 1 user per role |
| `mock/index.ts` | `getAdminDashboardData`, `getHospitalDashboardData`, `getDriverDashboardData`, `getDisposalDashboardData`, `getRegulatorDashboardData` | inferred return objects | — |

Components get data by calling these functions **synchronously inside Client Components** (`const data = getXxxDashboardData()`).
The names already match the "query function" names in `docs/dashboards.md`, which makes the later swap easy.
"Today" is hard-coded as `2026-10-03` in `mock/index.ts`. The mock uses fictional names, phone numbers and emails.

### 1.5 Auth, API, server actions, database, env

| Item | State |
|---|---|
| Clerk | Package installed; **not used** (no `<ClerkProvider>`, no `middleware.ts`, no `<SignIn/>`). |
| API routes (`route.ts`) | **None.** |
| Server Actions | **None.** |
| Database code | **None** (`src/server/db` does not exist). |
| `src/env.ts` | zod schema with **defaults for secrets** (placeholder Clerk keys, `CRON_SECRET`). Defaults hide missing config, so validation can never fail. No `DATABASE_URL`, SMS, email, storage or tracker vars. |
| `.env.example` | Clerk placeholders, map tiles, `NODE_ENV`, `CRON_SECRET`. |
| `.env.local` | Exists (same keys). Values not inspected or reported. |
| git | The folder is **not a git repository** (PROMPT 00 pre-step 2 not done yet). |

### 1.6 Lint / typecheck / build results (run on 7 Oct 2026 with the local binaries, because pnpm is not installed)

| Check | Command | Result |
|---|---|---|
| typecheck | `node_modules/.bin/tsc --noEmit` | **PASS** (exit 0, no errors) |
| lint | `node_modules/.bin/next lint` | **FAIL (cannot run)**: no ESLint config. Next asks interactively "How would you like to configure ESLint? Strict / Base" and exits 1. No lint rules have ever run on this code. |
| build | `node_modules/.bin/next build` | **PASS**: "Compiled successfully", "Linting and checking validity of types" passed, 11/11 pages generated, exit 0. First-load JS: `/admin` 204 kB and `/regulator` 206 kB (Recharts); other pages 88–104 kB. |

---

## Step 2 — Screen and component inventory

Legend: **C** = Client Component (`"use client"`), **S** = Server Component. Every page today is **C**.

### 2.1 Super Administrator — `src/app/admin/page.tsx` (C)

| Screen / widget | File | What it shows | Data fields it uses | User actions | C/S |
|---|---|---|---|---|---|
| PageHeader "Admin & Operations Workstation" | admin/page.tsx | Title, badge "CENTRAL OPERATIONS: ACTIVE" | — | — | C |
| KPI: Awaiting Pickup | admin/page.tsx | REGISTERED records + kg | `kpis.awaitingPickupRecordsCount`, `awaitingPickupKg` | — (hard-coded trend "+8% this week") | C |
| KPI: Trips Today | admin/page.tsx | count | `kpis.tripsTodayCount` (subtitle "2 Active Drivers" hard-coded) | — | C |
| KPI: In Transit Records | admin/page.tsx | count (IN_TRANSIT + COLLECTED) | `kpis.recordsInTransitCount` | — | C |
| KPI: Awaiting Destruction | admin/page.tsx | RECEIVED containers | `kpis.receivedAwaitingDestructionCount` | — | C |
| KPI: Outstanding Invoices | admin/page.tsx | ETB sum + count | `kpis.outstandingEtb`, `outstandingInvoicesCount` | — | C |
| KPI: Overdue Pickups | admin/page.tsx | count, subtitle "> 3 days" (hard-coded) | `kpis.overduePickupsCount` | — | C |
| Tab bar (6 tabs) | admin/page.tsx | overview / fleet / invoices / contracts / categories / alerts | counts | Click tab (local state only) | C |
| Live Fleet GPS Radar | `FacilityMap` | vehicle + stop pins (fake positions) | `vehicles[]`, `tripsToday[0].stops` | Click pin → detail drawer | C |
| 30-Day Waste Volume bar chart | admin/page.tsx (Recharts) | kg per category | `categoryStats[{code,name,color,kg}]` | Hover tooltip | C |
| Today's Trips table | `DataTable` | trip code, plate, driver, stop progress, payload, status | `Trip.tripCode, vehiclePlate, driverName, completedStops, totalStops, totalWeightKg, status` | Search by plate, paginate | C |
| Fleet tab: full radar | `FacilityMap` | same as above, 520 px | same | Click pin | C |
| Invoices tab: 3 KPIs | admin/page.tsx | Outstanding / Settled / Draft | `kpis.outstandingEtb, settledEtb, draftInvoicesCount` | — | C |
| Invoices ledger | `DataTable` | invoice no, facility, amount ETB, billed kg, issue/due date, status | `Invoice.invoiceNo, facilityName, amountEtb, wasteKgTotal, issueDate, dueDate, status` | Search, status filter (ALL/ISSUED/PAID/DRAFT/OVERDUE), paginate | C |
| Contracts tab: "no contract" banner | admin/page.tsx | count of uncontracted facilities | `alerts.uncontractedFacilities` | — | C |
| Contracts table | `DataTable` | contract no, facility, **rate/kg**, end date, days remaining, status | `Contract.contractNumber, facilityName, ratePerKgEtb, endDate, daysUntilExpiry, status` | Search, paginate | C |
| Categories tab | admin/page.tsx | card per category with kg | `categoryStats` | — | C |
| Alerts: OTP overrides | admin/page.tsx | override audit rows | `AuditLog.facilityName, details, timestamp` | — | C |
| Alerts: **Facilities missing authorized contact** | admin/page.tsx | missing phone/email | `Facility.authorizedContactPhone/Email` | — | C |
| Alerts: Vehicles without tracker | admin/page.tsx | plate, model, MAINTENANCE badge | `Vehicle.plateNumber, model` | — | C |
| Sidebar links `?tab=…` incl. `/admin?tab=settings` | `sidebar.tsx` | nav | — | Links **do nothing**: the page ignores `searchParams`, and there is no settings tab | C |

**Missing for this role:** facilities/users/fleet/trackers/settings management, trip builder, reassignment, override,
certificate revoke, invoice issue/settle/cancel, monthly-invoice trigger, licenses.

### 2.2 Hospital Administrator and 2.3 Hospital Staff / EHO — `src/app/hospital/page.tsx` (C, shared)

Both roles use the same page. The only difference is that the invoice box and tab show for `hospital_admin` (and also for `super_admin`, which is correct: Appendix C gives super_admin W on contracts and invoices).
`facilityId` comes from the mock user, with a fallback to `"fac-01"`. In the mocks, Hospital Admin belongs to fac-01 and Staff to fac-02.

| Screen / widget | File | What it shows | Data fields | User actions | Roles | C/S |
|---|---|---|---|---|---|---|
| PageHeader "{facility} Station" | hospital/page.tsx | name, code, address, **"Authorized EHO: {authorizedContactName}"** | `facility.name, code, address, authorizedContactName` | — | HA, HS | C |
| "Incomplete contact" banner | hospital/page.tsx | asks to update phone/email | `facility.hasIncompleteContact` | — | HA, HS | C |
| KPI: Waiting for Pickup | hospital/page.tsx | REGISTERED count + kg | `kpis.waitingPickupCount, waitingPickupKg` | — | HA, HS | C |
| KPI: Scheduled Pickups | hospital/page.tsx | REGISTERED with `pickupScheduledDate` | `kpis.scheduledCount` | — | HA, HS | C |
| KPI: In Transit | hospital/page.tsx | IN_TRANSIT + COLLECTED | `kpis.inTransitCount` | — | HA, HS | C |
| KPI: Disposed This Month | hospital/page.tsx | DESTROYED kg + count (not filtered by month) | `kpis.disposedThisMonthKg/Count` | — | HA, HS | C |
| Tab bar | hospital/page.tsx | overview / manifests / certs / (invoices) | — | Click tab | HA, HS | C |
| Recent Waste Manifests table | `DataTable` | code, category colour + name, containers, kg, status, date | `WasteRecord.wasteCode, categoryName, mohColor, containerCount, weightKg, status, createdAt` | Search, paginate | HA, HS | C |
| Latest Destruction Certificates | `DataTable` | cert no, kg + units, method, issue date, status | `DisposalCertificate.certificateNo, wasteWeightKg, containerCount, destructionMethod, issueDate, status` | Search, paginate. **No download** | HA, HS | C |
| Outstanding Invoices box | hospital/page.tsx + `DataTable` | total ETB, invoice rows | `openInvoices[], totalOpenInvoicesEtb`; `Invoice.invoiceNo, billingPeriod, amountEtb, dueDate, status` | Search | HA | C |
| Waste Records tab | `DataTable` | same columns (only the 10 "recent" records) | `recentRecords` | Search | HA, HS | C |
| Certificates tab | `DataTable` | same as above | `certificates` | Search | HA, HS | C |
| Invoices tab | `DataTable` | open invoices only | `openInvoices` | Search | HA | C |

**Missing:** register-waste form, label printing, cancel waste, "truck at the door" + in-app confirm, facility users and
OTP-recipient management (HA), phone-verification status, certificate PDF download, contract status (HA).

### 2.4 Fleet Driver — `src/app/driver/page.tsx` (C)

| Screen / widget | File | What it shows | Data fields | User actions | C/S |
|---|---|---|---|---|---|
| PageHeader "Driver Mobile Console" | driver/page.tsx | driver name, licence no, vehicle | `driver.fullName, licenseNumber, assignedVehiclePlate` | — | C |
| Tabs: Today's Trip / Upcoming Routes | driver/page.tsx | — | `activeTrip.tripCode`, `upcomingTrips.length` | Click tab | C |
| Active trip banner | driver/page.tsx | trip code, status, plate, payload kg, progress bar | `Trip.tripCode, status, vehiclePlate, totalWeightKg, completedStops, totalStops` | — | C |
| Stop cards (ordered) | driver/page.tsx | order no, facility, address, **Authorized Contact name + phone**, planned/actual time, containers + kg, categories, "Handover Verified", "OTP Override Logged" | `TripStop.stopOrder, facilityName, facilityCode, address, contactName, contactPhone, plannedArrival, actualArrival, stopStatus, containersToCollect, weightKgToCollect, categories[], otpOverrideUsed` | **None** (the text says "Tap cards to inspect details", but cards are not clickable) | C |
| Upcoming trips cards | driver/page.tsx | code, date/time, plate, stops, bins, kg | `Trip.*` | — | C |
| Driver id | — | hard-coded `getDriverDashboardData("drv-01")` (ignores the logged-in user) | — | — | — |

**Missing:** Start trip, Arrived, QR scanner, scanned x/n counter, OTP entry, resend OTP, skip with reason, manifest PDF,
"waiting for hospital confirmation" state, error/retry handling for weak signal.

### 2.5 Disposal Operator — `src/app/disposal/page.tsx` (C)

| Screen / widget | File | What it shows | Data fields | User actions | C/S |
|---|---|---|---|---|---|
| PageHeader "Disposal Plant Operations" | disposal/page.tsx | plant name, badge **"INCINERATOR STATUS: 1150°C"** (hard-coded) | — | — | C |
| KPI: Inbound Trucks | disposal/page.tsx | IN_PROGRESS trips | `inboundTrucks.length` | — | C |
| KPI: Destruction Queue | disposal/page.tsx | RECEIVED containers | `stats.queueCount` | — | C |
| KPI: Destroyed Today | disposal/page.tsx | kg + count | `stats.destroyedTodayKg/Count` | — | C |
| KPI: Exceptions (30 days) | disposal/page.tsx | missing + refused | `exceptions.*` | — | C |
| Tabs: queue / trucks / exceptions | disposal/page.tsx | — | counts | Click tab | C |
| Destruction queue table | `DataTable` | container code + **"Barcode"**, source hospital, category colour, kg, received time, status | `WasteContainer.containerCode, barcode, facilityName, categoryName, mohColor, weightKg, receivedAt, status` | Search, paginate | C |
| Inbound trucks cards | disposal/page.tsx | plate, driver, kg, **"sealed bins"** | `Trip.vehiclePlate, status, driverName, totalWeightKg, totalContainers` | — | C |
| Exceptions log | `DataTable` | code, facility, MISSING/REFUSED, notes, date | `WasteContainer.containerCode, facilityName, status, incidentNotes, createdAt` | Search | C |

**Missing:** receipt scanner, mark MISSING/REFUSED with reason, "complete receipt" per waste record, record destruction
(method from `destruction_methods`), certificate generation state (PENDING/FAILED), CLOSED_NO_DESTRUCTION.

### 2.6 EFDA Regulatory & Audit Officer — `src/app/regulator/page.tsx` (C)

| Screen / widget | File | What it shows | Data fields | User actions | C/S |
|---|---|---|---|---|---|
| PageHeader + "MUTATIONS DISABLED" pill | regulator/page.tsx | read-only badge | — | — | C |
| Filter toolbar | regulator/page.tsx | facility select, category select | `facilities[], categories[]` | Change filters (re-runs mock query) | C |
| KPI: Monitored Volume | regulator/page.tsx | kg + containers (filtered) | `kpis.totalKg, totalContainers` | — | C |
| KPI: Licensed Facilities | regulator/page.tsx | count | `kpis.activeHospitalsCount` | — | C |
| KPI: Verified Certs | regulator/page.tsx | count, subtitle "100% compliant with EFDA standards" (hard-coded claim) | `kpis.certificatesIssuedCount` | — | C |
| KPI: Revoked Certs | regulator/page.tsx | count | `kpis.certificatesRevokedCount` | — | C |
| Tabs: analytics / audit / certs / map | regulator/page.tsx | — | — | Click tab | C |
| 8-week trend area chart | regulator/page.tsx (Recharts) | weekly kg (**hard-coded array**, ignores filters), "+14.2% Growth" hard-coded | `weeklyTrends[{week,kg,containers}]` | Hover | C |
| Facility generation league | `DataTable` | name, code, kg, containers (**ignores filters**) | `facilityBreakdown[]` | Search | C |
| Audit ledger table | `DataTable` | action, actor + role, facility, details, IP, time | `AuditLog.action, performedBy, userRole, facilityName, details, ipAddress, timestamp` | Search by details | C |
| Certificates registry | `DataTable` | no, facility, kg, method, status, **verify token** | `DisposalCertificate.*` | Search | C |
| Route map | `FacilityMap` | vehicles + stops of `trips[0]` (not a replay) | `vehicles, trips[0].stops` | Click pin | C |

**Missing:** audit hash-chain integrity check, route replay per trip (`/api/tracking/trips/{id}`), override/geofence
evidence view, exports (PDF/XLSX), `/regulator/audit` route.
The page is read-only. Filters and tabs are the only interactions, so it does **not** violate the EFDA write rule.

### 2.7 Shared, public and auth pages

| Screen | File | Notes | C/S |
|---|---|---|---|
| `/` | app/page.tsx | Client redirect from the mock role | C |
| `/sign-in` | app/sign-in/[[...sign-in]]/page.tsx | No Clerk `<SignIn/>`; an "Enter Demo Workstation" button goes to `/admin` | C |
| `/pending` | app/pending/page.tsx | Text + "Return to Demo Console" link to `/admin` | C |
| `/finance` | app/finance/page.tsx | Client redirect to `/admin?tab=invoices` (CLAUDE.md: `/admin/finance`) | C |
| `/verify/[token]` | app/verify/[token]/page.tsx | Falls back to `MOCK_CERTIFICATES[0]` for **any unknown token** (a fake token shows a valid certificate). Shows operator and witness **person names**. Header says "ETHIOPIAN FOOD & DRUG AUTHORITY (EFDA)", and the revoke banner says "REVOKED BY EFDA AUDIT". Claims "SHA256 Cryptographic Match" without any check. No PDF upload. Back link goes to `/admin`. Rendered inside the app shell with sidebar + role switcher. | C |
| Root layout | app/layout.tsx | Sidebar + Header + role switcher on **every** page, including public `/verify` and `/sign-in` | S (wraps C) |
| Sidebar | components/shared/sidebar.tsx | Role nav, fake stat pills ("Verified 100%", "LIVE"), Settings link, "Sign Out" = switch to super_admin | C |
| Header | components/shared/header.tsx | Search box (no behaviour), theme/bell/settings buttons (no behaviour), role switcher | C |
| StatusBadge | components/shared/status-badge.tsx | Colour **+ text** (good). Only knows v1.1 statuses | S-capable (no hooks) |
| KpiCard, PageHeader, EmptyState, ErrorState | components/shared/* | Presentational. EmptyState/ErrorState are **never used** | S-capable |
| DataTable | components/shared/data-table.tsx | Client-side search + pagination (page size 6) over the full array | C |
| FacilityMap | components/shared/facility-map.tsx | **Not a map**: dotted background, pins at fixed percentage positions, fake "Battery: 90%". No Leaflet, no tiles, no coordinates used | C |

---

## Step 3 — Map the frontend to the architecture

### 3.1 Widget / action → architecture

Module numbers from §5.1. "Q" = read query in `src/server/queries/<area>.ts`, "S" = write service.

| Widget / action (area) | Module # | Service function or query | Endpoint / Server Action (§9.2) | Tables (§6.2) | Status values used (v1.2) |
|---|---|---|---|---|---|
| Admin KPI Awaiting Pickup | 18 (+8) | Q `admin.getPickupBacklog()` | Server Component (no endpoint) | waste_records | REGISTERED |
| Admin KPI Trips Today | 18 (+11) | Q `admin.getTripsToday()` | — | trips | PLANNED, IN_PROGRESS, COMPLETED |
| Admin KPI In Transit | 18 | Q `admin.getWasteCounts()` | — | waste_records | IN_TRANSIT |
| Admin KPI Awaiting Destruction | 18 (+15) | Q `admin.getWasteCounts()` | — | waste_records / containers | RECEIVED |
| Admin KPI Outstanding Invoices | 18 (+17) | Q `admin.getBillingSummary()` | — | invoices | ISSUED (+ derived past-due) |
| Admin KPI Overdue Pickups | 18 | Q `admin.getOverduePickups()` uses `getSetting('overdue_pickup_days')` | — | waste_records, settings | REGISTERED (+ age) |
| Admin Live Fleet Radar | 14 | Q `tracking.livePositions()` | `GET /api/tracking/live` (polled 30 s) | gps_events, vehicles, trips | trip IN_PROGRESS only |
| Admin 30-day category chart | 18 | Q `admin.getCategoryVolume(30d)` | — | waste_records, waste_categories | all except CANCELLED |
| Admin Today's Trips table | 11 | Q `admin.listTrips({date})` | — | trips, trip_stops, vehicles, drivers | trip + stop statuses |
| Admin Invoices ledger + filter | 17 | Q `billing.listInvoices({status, cursor})` | — | invoices, facilities | DRAFT, ISSUED, SETTLED_OFFLINE, CANCELLED |
| Admin Invoice issue / settle / cancel (missing) | 17 + 7 | S `issueInvoice`, `settleOffline`, `cancelInvoice` | Server Actions | invoices, audit_logs, outbox_messages | DRAFT→ISSUED→SETTLED_OFFLINE; →CANCELLED |
| Admin generate monthly (missing) | 17 | S `generateMonthly` | `POST /api/jobs/monthly-invoices` + manual Server Action | contracts, invoices, settings | DRAFT |
| Admin Contracts table | 17 | Q `billing.listContracts()` | — | contracts, facilities | ACTIVE, EXPIRING_SOON, EXPIRED |
| Admin "uncontracted facilities" banner | 17 + 4 | Q `billing.facilitiesWithoutActiveContract()` | — | facilities, contracts | derived |
| Admin Categories tab | 5 + 18 | Q `catalog.categoryVolumes()` | — | waste_categories, waste_records | — |
| Admin Alerts: OTP overrides | 13 + 6 | Q `admin.recentOverrides(7d)` | — | trip_stops (`collection_method=OVERRIDE`), audit_logs | COLLECTED_OVERRIDE |
| Admin Alerts: missing contact → **facility not ready** | 3 + 4 | Q `facilities.notReady()` (no OTP recipient) | — | facilities, users | — |
| Admin Alerts: vehicles without tracker | 5 | Q `fleet.vehiclesWithoutTracker()` | — | vehicles, tracker_devices | vehicle_status |
| Admin trip builder / reassign / cancel (missing) | 11 + 7 | S `createTrip`, `reorderStops`, `assignTrip`, `reassignTrip`, `cancelTrip` | Server Actions; `POST /api/trips/{id}/reassign` | trips, trip_stops, trip_stop_waste, otp_codes, licenses | PLANNED; waste REGISTERED↔SCHEDULED |
| Admin override (missing) | 13 + 7 | S `overrideStop` → completion service | `POST /api/stops/{id}/override` | trip_stops, containers, waste_records, handovers | COLLECTED_OVERRIDE |
| Admin revoke certificate (missing) | 16 | S `revokeCertificate` | `POST /api/certificates/{id}/revoke` | certificates | ISSUED→REVOKED |
| Hospital header + facility info | 4 | Q `hospital.getFacility()` | — | facilities | facility_status |
| Hospital KPIs (4) | 18 | Q `hospital.getKpis(facilityId)` | — | waste_records | REGISTERED, SCHEDULED, IN_TRANSIT, DISPOSED(_WITH_EXCEPTION) |
| Hospital waste records table | 8 | Q `hospital.listWaste({cursor})` | — | waste_records, waste_categories | all waste statuses |
| Hospital register waste (missing) | 8 + 9 | S `registerWaste` | Server Action | waste_records, containers, audit_logs | REGISTERED; containers LABELLED |
| Hospital print labels (missing) | 9 | S `generateLabels` | `GET /api/waste/{id}/labels` | containers | — |
| Hospital cancel waste (missing) | 8 + 7 | S `cancelWaste` | Server Action | waste_records | →CANCELLED |
| Hospital "truck at the door" + confirm (missing) | 13 | Q `hospital.activeHandover()`; S `confirmInApp` → completion service | `GET /api/hospital/active-handover` (10 s); `POST /api/stops/{id}/confirm-handover` | trip_stops, handovers, containers | stop ARRIVED → COLLECTED (IN_APP) |
| Hospital certificates table + download | 16 | Q `hospital.listCertificates()`; signed URL | `GET /api/certificates/{id}/pdf` | certificates, disposal_records | PENDING, ISSUED, FAILED, REVOKED |
| Hospital invoices (HA) | 17 | Q `hospital.listInvoices()` | `GET /api/invoices/{id}/pdf` | invoices | ISSUED, SETTLED_OFFLINE, CANCELLED |
| Hospital users + OTP recipients (HA, missing) | 3 | S `inviteUser`, `setOtpRecipient` | Server Actions; `POST /api/webhooks/clerk` | users | — |
| Driver active trip banner | 12 | Q `driver.getJobs()` | `GET /api/driver/jobs` | trips, trip_stops, vehicles | trip statuses |
| Driver stop cards | 12 | Q `driver.getJobs()` | same | trip_stops, trip_stop_waste, containers, facilities | stop statuses |
| Driver start trip (missing) | 12 + 7 | S `startTrip` | `POST /api/trips/{id}/start` | trips, licenses | PLANNED→IN_PROGRESS |
| Driver Arrived (missing) | 12 + 13 + 14 | S `arrive` (+ `issueOtp`, `distanceToFacility`) | `POST /api/stops/{id}/arrive` | trip_stops, otp_codes, outbox_messages, gps_events | PENDING→ARRIVED; OTP ISSUED |
| Driver scan (missing) | 12 | S `scanContainer` | `POST /api/stops/{id}/scan` | handovers, containers | LABELLED→SCANNED_AT_PICKUP |
| Driver OTP entry (missing) | 13 | S `verifyOtp` → completion service | `POST /api/stops/{id}/verify-otp` | otp_codes, trip_stops, containers, waste_records | ARRIVED→COLLECTED |
| Driver resend / skip (missing) | 13 / 12 | S `resendOtp`, `skipStop` | `POST /api/stops/{id}/resend-otp`, `/skip` | otp_codes, trip_stops, handovers | OTP CANCELLED; →SKIPPED |
| Driver manifest (missing) | 11 | S `manifestPdf` | `GET /api/trips/{id}/manifest` | trips, trip_stops | — |
| Driver upcoming trips | 12 | Q `driver.getJobs()` | `GET /api/driver/jobs` | trips | PLANNED |
| Disposal KPIs | 18 + 15 | Q `disposal.getStats()` | — | containers, trips | RECEIVED, DESTROYED, MISSING, REFUSED |
| Disposal queue table | 15 | Q `disposal.destructionQueue()` | — | containers, waste_records | RECEIVED |
| Disposal inbound trucks | 15 + 11 | Q `disposal.inboundTrips()` | — | trips | IN_PROGRESS |
| Disposal exceptions log | 15 | Q `disposal.exceptions(30d)` | — | containers | MISSING, REFUSED |
| Disposal receive / exception / destroy (missing) | 15 + 7 | S `receiveContainer`, `markException`, `completeReceipt`, `recordDestruction` | `POST /api/disposal/receive`, `/containers/{id}/exception`, `/waste/{id}/destroy` | containers, waste_records, disposal_records, certificates | see §5 of CLAUDE.md |
| Regulator filters + KPIs | 19 | Q `regulator.getKpis({facilityId, categoryId})` | — | waste_records, certificates, facilities | — |
| Regulator weekly trend | 19 | Q `regulator.weeklyVolume(8w)` | — | waste_records | — |
| Regulator facility league | 19 | Q `regulator.facilityVolumes()` | — | waste_records, facilities | — |
| Regulator audit ledger + chain check | 6 + 19 | Q `regulator.listAudit({cursor})`, `verifyAuditChain()` | `GET /api/audit-logs` | audit_logs | — |
| Regulator certificates | 16 + 19 | Q `regulator.listCertificates()` | `GET /api/certificates/{id}/pdf` | certificates | PENDING, ISSUED, FAILED, REVOKED |
| Regulator route map / replay | 14 | Q `tracking.tripTrack(tripId)` | `GET /api/tracking/trips/{id}` | gps_events | — |
| Public verify page | 16 | Q `verify(token)`; `checkFile` | `GET /api/verify/{token}`, `POST /api/verify/{token}/check-file` | certificates, disposal_records | ISSUED, REVOKED (PENDING/FAILED = not valid) |
| `/` redirect, `/pending`, `/sign-in` | 2 | `getCurrentUser()` | `middleware.ts` | users | — |
| Role switcher | 2 | dev-only `user:assign` / seeded users | — | users | — |

### 3.2 Matches (fits the architecture as-is)

- Exactly 6 roles with the right codes and display names (`src/types/auth.ts`). No `finance_officer`, no `auditor`.
- One route per area: `/admin`, `/hospital`, `/driver`, `/disposal`, `/regulator`, plus `/verify/[token]`, `/sign-in`, `/pending`.
- Billing lives inside `/admin`, and `/finance` only redirects (target path is wrong, see mismatches).
- The EFDA page has no write actions and shows "read-only / mutations disabled".
- Hospital Admin sees invoices and Hospital Staff does not; super_admin may also see them (Appendix C).
- `StatusBadge` shows colour **and** text.
- Facility codes `DD-REF-001`, `DD-GEN-002`, … match §9 of CLAUDE.md. `FacilityType`, `FacilityStatus`, `VehicleStatus`,
  `DriverStatus`, `TripStatus` and `ContractStatus` already match the v1.2 enums.
- Dark zinc + emerald look, shared components in `src/components/shared/`.
- Mock "query" function names per area match `docs/dashboards.md`, a good seam for real queries.
- Money is labelled ETB everywhere. The driver page is narrow (`max-w-4xl`), which is a mobile-ish start.

### 3.3 Mismatches (UI contradicts the architecture)

| # | Mismatch | Where | Required (v1.2 / CLAUDE.md) |
|---|---|---|---|
| M1 | Waste statuses COLLECTED, COLLECTED_OVERRIDE, DESTROYED, REVOKED; no SCHEDULED, DISPOSED, DISPOSED_WITH_EXCEPTION, CLOSED_NO_DESTRUCTION | `types/waste.ts`, `mock/waste-records.ts`, `mock/index.ts`, `status-badge.tsx` | `waste_status` in CLAUDE.md §5 |
| M2 | "Scheduled" derived from `REGISTERED + pickupScheduledDate` | `mock/index.ts` (`getHospitalDashboardData`) | SCHEDULED is a real status in v1.2 |
| M3 | Container statuses REGISTERED, **SEALED**, IN_TRANSIT; `sealNumber` field; "sealed bins" text | `types/waste.ts`, `disposal/page.tsx`, `status-badge.tsx` | LABELLED, SCANNED_AT_PICKUP, COLLECTED, RECEIVED, MISSING, REFUSED, DESTROYED. No seal step |
| M4 | Stop statuses IN_PROGRESS / COMPLETED | `types/fleet.ts`, `driver/page.tsx`, `facility-map.tsx` | PENDING, ARRIVED, COLLECTED, COLLECTED_OVERRIDE, SKIPPED |
| M5 | Override shown as a boolean `otpOverrideUsed` | `types/fleet.ts`, `driver/page.tsx` | `collection_method` OTP / IN_APP / OVERRIDE + `override_reason` |
| M6 | Certificate status ISSUED/REVOKED only | `types/disposal.ts` | PENDING, ISSUED, FAILED, REVOKED |
| M7 | Invoice statuses PAID, OVERDUE | `types/finance.ts`, admin filter, `mock/finance.ts` | DRAFT, ISSUED, SETTLED_OFFLINE, CANCELLED. Overdue is a derived alert |
| M8 | **Authorized contact** on facility (name/phone/email/backup), "missing contact" alerts, "Authorized EHO" in header, contact name + phone on driver stop cards | `types/facility.ts`, `mock/facilities.ts`, `admin/page.tsx`, `hospital/page.tsx`, `driver/page.tsx`, `types/fleet.ts` | Removed. OTP goes to Clerk-verified hospital users. Alert = "facility not ready (no OTP recipient)" |
| M9 | Contract priced per kg (`ratePerKgEtb`) + `monthlyRetainerEtb`; invoice has `wasteKgTotal` "Billed Volume" | `types/finance.ts`, admin contracts/invoices tables | `monthly_fee_santim` only; weight is recorded, not billed; invoice has subtotal / VAT / total |
| M10 | Money as float ETB numbers | all finance types | integer santim (`bigint`), formatted by `src/lib/money.ts` |
| M11 | Human codes `WST-20261002-046`, `CNT-…`, `TRP-20261003-01`, `CERT-202609-0078`, `INV-202608-044`, `CTR-2025-DD01` | all mocks | `WR-2610-00042`, `WR-2610-00042-C03`, `TR-261004-01`, `CD-2026-00017`, `INV-2026-10-0031` (contract code not defined) |
| M12 | Separate `barcode` per container | `types/waste.ts`, disposal queue | QR holds only the container code |
| M13 | Verify page shows operator name + **witness name**, says it is issued/revoked by EFDA, accepts any token (falls back to first cert), fakes the SHA-256 match, sits inside the app shell | `verify/[token]/page.tsx` | Minimum public data, no person names; issuer is the disposal company; unknown token → "not found"; real hash compare by upload; no app chrome |
| M14 | `/finance` → `/admin?tab=invoices` | `finance/page.tsx` | `/admin/finance` |
| M15 | Hospital facility silently falls back to `"fac-01"` when the user has none | `hospital/page.tsx` | no silent default facility. *(Correction 7 Oct 2026: super_admin seeing invoices is correct — Appendix C gives super_admin W on contracts and invoices — and was removed from this row.)* |
| M16 | Driver page ignores the user (`"drv-01"` hard-coded) | `driver/page.tsx` | own trips only, current assignment |
| M17 | Disposal operator mock user has `facilityId: "fac-18"` | `mock/users.ts` | Matches the CLAUDE.md DECISION (facility = disposal site). The document §6.2 still says "forbidden"; client confirmation pending |
| M18 | Settings: `overduePickupDays 3`, `otpExpiryMinutes 15`, `autoArchiveCertificatesDays` | `mock/audit.ts`, `types/audit.ts` | 7, 10; `certificate_archive_days` is no longer a setting |
| M19 | Audit actions `CONTAINER_SEALED`, `INVOICE_PAID`; no SCANNED / IN_APP / OTP_CANCELLED / REASSIGNED events; no `prev_hash/hash` | `types/audit.ts` | v1.2 events + hash chain |
| M20 | "Sign out" switches to super_admin; pending/verify pages link to `/admin` | sidebar, pending, verify | real sign-out; no links into admin from public pages |

Not found (good): no EFDA editing, no reassignment UI at all (so none after ARRIVED), no offline-first driver behaviour,
no partial-pickup UI, no `finance_officer`/`auditor`.

### 3.4 In the UI but not in the architecture

| Item | Where | Label or feature? | Proposal |
|---|---|---|---|
| "Barcode" / "Barcoded containers" | disposal queue, hospital table description, `ROLE_CONFIGS.hospital_staff.description` | Label + field | Rename to "QR"; drop the `barcode` field |
| "Manifest" for a waste record ("Manifest Code", "Recent Waste Manifests") | hospital page | Label | Rename to "Waste ID / Waste records". "Manifest" means the trip manifest PDF (E4) |
| "Pickup scheduling" / "pickup requests" for hospital staff | `ROLE_CONFIGS.hospital_staff.description`, `docs/dashboards.md` | Feature wording | Only super_admin schedules. Rename to "follow pickups" |
| Incinerator temperature "1150°C", `temperatureCelsius`, `emissionsCompliant` | disposal header, `DestructionRecord` | **Feature** (no data source) | Remove or ask the client (not in scope) |
| "Regulatory Witness" (`witnessName`) | verify page, certificate type | **Feature** | Not in architecture. Remove or ask |
| Vehicle `batteryLevel`, `trackerImei`, `currentPayloadKg`, `model` | `types/fleet.ts`, map drawer | Mostly fields | Keep `model` only if added to `vehicles`; battery/payload not in scope |
| Driver `rating`, `tripsCompletedCount` | `types/fleet.ts` | Feature | Not in scope |
| `monthlyWasteEstimateKg`, `kebele`, `city` on facility | `types/facility.ts` | Fields | Ask whether to add to `facilities` (address is enough) |
| `NO_CONTRACT` contract status | `types/facility.ts`, StatusBadge | Label (derived) | Keep as a derived badge, not an enum value |
| Waste category `hazardLevel`, `containerType`, `treatmentMethod` | `types/waste.ts` | Fields | Ask; table has code, name, colour_code, active |
| Destruction methods as a TS enum (incl. "SECURE_LANDFILL_ENCAPSULATION") | `types/disposal.ts` | Data | Move to `destruction_methods` table (seed) |
| Header search, theme toggle, bell, settings buttons | header.tsx | Buttons for non-existent features | Hide until built (CLAUDE.md: no buttons for features that do not exist) |
| "Tap cards to inspect details" | driver page | Label | Remove or make it real |
| KPI trends ("+8% this week", "+14.2% Growth", "100% compliant…") | admin, regulator | Hard-coded claims | Compute from data or remove |
| `Trip.routeCoordinates`, `plannedArrival`/ETA strings | trips mock | Field | Planned times are not in §6.2 (`planned_date` only); route comes from `gps_events` |
| `docs/dashboards.md` with real-looking names ("Nebiyu Platform Admin", doctors' names) | docs | Doc | Fictional, but update to v1.2 later |

### 3.5 In the architecture but missing in the UI

- Hospital: register-waste form, label printing/reprint, cancel waste, **"truck at the door" + in-app confirmation**,
  scanned x/n view, facility users and OTP-recipient management (HA), phone-verification status, certificate PDF
  download, contract status (HA).
- Driver: start trip, arrival + geofence result, **QR scanner**, x/n scanned counter, OTP entry with attempts left,
  resend with cooldown, skip with reason, "waiting for hospital confirmation", manifest PDF, idempotent retry UX.
- Admin: facilities CRUD + **"facility not ready"**, users/roles, vehicles, drivers, trackers, **licenses + expiry alerts**,
  settings editor, waiting list + **trip builder** (stop order, max stops), reassignment (PLANNED only), trip cancel,
  **override with reason**, certificate revoke/reissue, invoice issue/settle/cancel, monthly-invoice trigger,
  outbox FAILED alerts, silent-tracker alerts, past-due invoice alerts, exports.
- Disposal: receipt scanner, MISSING/REFUSED with reason, complete receipt, record destruction (method),
  **certificate PENDING/FAILED state**, CLOSED_NO_DESTRUCTION.
- Regulator: `/regulator/audit` route, **audit hash-chain indicator/check**, real route replay, override and geofence
  evidence, exports.
- Public: real `/verify/[token]` (not found / revoked / pending states, PDF hash upload).
- Platform: real map (Leaflet), `/api/health`, `/pending` driven by the DB, loading skeletons (Suspense), error states.

### 3.6 Pending medicine features (CLAUDE.md §12)

No UI exists for medicine stock upload, expiry alerts, or EFDA approval of disposal requests.
The only related text is the waste category "Expired & Cytotoxic Pharmaceuticals" in `src/mock/categories.ts`.
That is a normal waste category, not the pending feature. **Status: nothing to keep. PENDING — not started.**

---

## Step 4 — Data contracts

### 4.1 Types the UI expects today vs §6.2

| UI type (file) | §6.2 table(s) | Differences |
|---|---|---|
| `UserProfile` (`types/auth.ts`) | users | UI: `status ACTIVE/INACTIVE/PENDING`, `roleTitle`, `department`, `avatarUrl`, `phone`. Table: `active` bool, `phone_e164`, `phone_verified`, `receives_pickup_otp`, `clerk_user_id`. Missing verified/OTP-recipient flags |
| `Facility` | facilities | UI has authorized contact ×5 fields, `hasIncompleteContact`, `contractStatus`, `kebele`, `city`, `monthlyWasteEstimateKg`. Missing: readiness (OTP recipients count) |
| `WasteCategory` | waste_categories | UI `mohColor`+`hexColor`, `hazardLevel`, `containerType`, `treatmentMethod`, `description`; table `colour_code`, `active` |
| `WasteRecord` | waste_records | Status enum (M1). UI denormalised `facilityName/Code`, `categoryName`, `mohColor` (fine for a view model). `registeredBy` is a name (table: user id). `pickupScheduledDate`/`collectedAt`/`receivedAt`/`destroyedAt` are not columns; they come from trips/disposal/audit. Missing `cancel_reason` |
| `WasteContainer` | containers | Status enum (M3). UI `barcode`, `sealNumber`, `weightKg` (no per-container weight in §6.2), `incidentNotes` (= `exception_reason`). Missing `seq_no` (container x of n) |
| `Vehicle` | vehicles, tracker_devices, gps_events | UI mixes live GPS (`currentLat/Lng/Speed`, `lastSeenAt`) and tracker fields into vehicle. Table `plate_no`, `capacity_kg`, `status`. `batteryLevel`, `currentPayloadKg`, `trackerImei` not in scope |
| `Driver` | drivers + users | UI `fullName`, `phone`, `licenseNumber`, `rating`, `tripsCompletedCount`. Table `user_id`, `license_no`, `default_vehicle_id`; licence expiry in `licenses` |
| `Trip` | trips | UI `startTime`/`endTime` strings (table `started_at`, `completed_at` timestamptz), aggregates `totalStops`, `completedStops`, `totalContainers`, `totalWeightKg` (computed), `routeCoordinates`, `currentGps`. Missing `cancel_reason` |
| `TripStop` | trip_stops (+ trip_stop_waste) | UI `stopOrder` (= `priority_order`), contact fields (remove), `plannedArrival` string (no column), `actualArrival` (= `arrived_at`), `containersCollected` (no partial pickup: derive scanned count), `otpOverrideUsed` (→ `collection_method`). Missing `arrival_distance_m`, `geofence_ok`, `override_reason`, `confirmed_by`, `completed_at` |
| `Invoice` | invoices | UI `amountEtb` float; table `subtotal`, `vat_rate`, `vat_amount`, `total` in santim. UI `issueDate`, `dueDate`, `paidDate`, `billingPeriod` text; table `period_start/end`, `issued_at`, `settled_at`, `settlement_ref`, `due_date` (**ASSUMPTION**: `due_date` column is added, because CLAUDE.md §5 needs it). `wasteKgTotal`/`containersTotal` not billed |
| `Contract` | contracts | UI `contractNumber`, `ratePerKgEtb`, `monthlyRetainerEtb`, `daysUntilExpiry`, `signedBy`. Table `monthly_fee_santim`, `terms`, `start_date`, `end_date`, `status` |
| `DisposalCertificate` | certificates + disposal_records | UI `issueDate` date string, `operatorName`, `witnessName`, `disposalSiteName`, `destructionMethod` enum. Table: `certificate_no`, `file_key`, `sha256`, `verify_token`, `status`(4), `issued_at`, `revoked_reason`, `generation_attempts`, `last_error` |
| `DestructionRecord` | disposal_records | Per-container in UI; table is per waste record (`waste_record_id` unique, `method_id`, `destroyed_at`, `locked`). `temperatureCelsius`, `emissionsCompliant` not in scope |
| `AuditLog` | audit_logs | UI `performedBy` name, `userRole`, `facilityName`, `details` text, `timestamp`. Table `actor_user_id`, `role`, `action`, `entity_type`, `entity_id`, `before`, `after`, `ip`, `request_id`, `prev_hash`, `hash`, `created_at` |
| `SystemSettings` | settings | UI object with 7 keys; table key/value with 17 keys (CLAUDE.md §7) |

Dates: UI mixes ISO timestamps (`createdAt`), plain dates (`"2026-10-02"`) and display strings (`"08:30 AM"`) and formats
them with `toLocaleDateString()` / `toLocaleTimeString()`. That gives the browser's time zone, not EAT.
Required: ISO 8601 UTC from the server, formatted only through `src/lib/dates.ts`.

### 4.2 Proposed view-model types (server queries return these)

Put them in `src/types/view-models/<area>.ts`. Money is returned as **santim (number)** plus a ready
`*Display` string from `money.ts`, or just santim and formatted in the component. Dates are ISO UTC strings.
Lists are paginated `{ items, nextCursor }`. Each dashboard widget gets its own query (Suspense per widget). The
`*DashboardData` types below are the union of those widget results, so existing components can switch with minimal change.

```ts
// shared
type Iso = string;                        // ISO 8601 UTC
type Santim = number;                     // integer, ETB × 100
type Page<T> = { items: T[]; nextCursor: string | null };
type CategoryRef = { code: string; name: string; colourHex: string };
type FacilityRef = { id: string; code: string; name: string };

// /admin
interface AdminKpis { awaitingPickupCount: number; awaitingPickupKg: number; tripsToday: number;
  inTransitCount: number; awaitingDestructionCount: number; overduePickupsCount: number;
  outstandingSantim: Santim; outstandingCount: number; pastDueCount: number }
interface TripRow { id: string; tripCode: string; plannedDate: string; status: TripStatus;
  vehiclePlate: string; driverName: string; stopsFinal: number; stopsTotal: number;
  containersTotal: number; weightKgTotal: number }
interface InvoiceRow { id: string; invoiceNo: string; facility: FacilityRef; periodStart: string; periodEnd: string;
  subtotalSantim: Santim; vatRatePercent: number; vatSantim: Santim; totalSantim: Santim;
  status: InvoiceStatus; issuedAt: Iso | null; dueDate: string | null; settledAt: Iso | null; isPastDue: boolean }
interface ContractRow { id: string; facility: FacilityRef; startDate: string; endDate: string;
  monthlyFeeSantim: Santim; status: ContractStatus; daysUntilExpiry: number }
interface AdminAlerts { overrides: { stopId: string; facility: FacilityRef; reason: string; at: Iso }[];
  facilitiesNotReady: FacilityRef[]; vehiclesWithoutTracker: { id: string; plate: string }[];
  silentTrackers: { vehiclePlate: string; lastSeenAt: Iso | null }[]; failedMessages: number;
  expiringLicenses: { subject: string; kind: string; expiresOn: string }[];
  uncontractedFacilities: FacilityRef[] }
interface VehiclePosition { vehicleId: string; plate: string; tripId: string; lat: number; lng: number;
  speedKmh: number | null; recordedAt: Iso }
interface AdminDashboardData { kpis: AdminKpis; tripsToday: TripRow[]; positions: VehiclePosition[];
  categoryVolume30d: (CategoryRef & { kg: number })[]; alerts: AdminAlerts;
  invoices: Page<InvoiceRow>; contracts: ContractRow[] }

// /hospital (always scoped to currentUser.facilityId)
interface WasteRow { id: string; wasteCode: string; category: CategoryRef; containerCount: number;
  weightKg: number; status: WasteStatus; createdAt: Iso }
interface CertificateRow { id: string; certificateNo: string; wasteCode: string; status: CertificateStatus;
  issuedAt: Iso | null; method: string | null; weightKg: number; destroyedCount: number; exceptionCount: number }
interface ActiveHandover { stopId: string; tripCode: string; vehiclePlate: string; driverName: string;
  arrivedAt: Iso; expectedContainers: number; scannedContainers: number; canConfirm: boolean }
interface HospitalDashboardData { facility: FacilityRef & { address: string; ready: boolean; otpRecipients: number };
  kpis: { registered: number; registeredKg: number; scheduled: number; inTransit: number;
    disposedThisMonth: number; disposedThisMonthKg: number };
  activeHandover: ActiveHandover | null; waste: Page<WasteRow>; certificates: Page<CertificateRow>;
  invoices?: Page<InvoiceRow>; contract?: ContractRow | null }      // invoices/contract: hospital_admin only

// /driver
interface StopCard { id: string; order: number; facility: FacilityRef & { address: string; lat: number; lng: number };
  status: StopStatus; expectedContainers: number; scannedContainers: number; weightKg: number;
  categories: (CategoryRef & { count: number })[]; arrivedAt: Iso | null; geofenceOk: boolean | null;
  distanceM: number | null; collectionMethod: "OTP" | "IN_APP" | "OVERRIDE" | null;
  otp: { status: OtpStatus; attemptsLeft: number; resendAvailableAt: Iso | null; codesLeft: number } | null }
interface DriverJob { id: string; tripCode: string; plannedDate: string; status: TripStatus;
  vehiclePlate: string; stops: StopCard[] }
interface DriverDashboardData { driver: { name: string; licenseNo: string; licenseValid: boolean };
  activeTrip: DriverJob | null; upcoming: DriverJob[] }

// /disposal
interface QueueContainer { id: string; containerCode: string; wasteCode: string; facility: FacilityRef;
  category: CategoryRef; status: ContainerStatus; receivedAt: Iso | null }
interface InboundTrip { tripId: string; tripCode: string; vehiclePlate: string; driverName: string;
  containersCollected: number; containersAccounted: number }
interface DisposalDashboardData { stats: { inbound: number; queue: number; destroyedToday: number;
    destroyedTodayKg: number; exceptions30d: number };
  inbound: InboundTrip[]; queue: Page<QueueContainer>;
  exceptions: Page<QueueContainer & { reason: string; at: Iso }>;
  certificatesPendingOrFailed: { certificateNo: string; status: "PENDING" | "FAILED"; attempts: number }[] }

// /regulator
interface AuditRow { id: string; at: Iso; actorName: string; role: UserRole; action: string;
  entityType: string; entityId: string; summary: string; ip: string | null }
interface RegulatorDashboardData { kpis: { totalKg: number; totalContainers: number; facilities: number;
    certificatesIssued: number; certificatesRevoked: number; overrides: number };
  weekly: { weekStart: string; kg: number; containers: number }[];
  facilityVolumes: (FacilityRef & { kg: number; containers: number })[];
  certificates: Page<CertificateRow & { facility: FacilityRef }>;
  audit: Page<AuditRow>; auditChain: { ok: boolean; checkedAt: Iso; brokenAtId: string | null } }

// public
interface VerifyResult { found: boolean; certificateNo?: string; status?: CertificateStatus; issuedAt?: Iso;
  facilityName?: string; wasteCode?: string; category?: string; containerCount?: number; weightKg?: number;
  destroyedAt?: Iso; method?: string; exceptions?: number }
```

---

## Step 5 — Routing plan (target, not created yet)

### 5.1 Structure

```
middleware.ts                                  Clerk: public routes vs signed-in
src/app/
  layout.tsx                                   <html>, ClerkProvider, fonts only (no sidebar)
  page.tsx                                     S: getCurrentUser() → redirect(area by role) or /sign-in or /pending
  (public)/
    layout.tsx                                 minimal public shell (no sidebar, no role switcher)
    sign-in/[[...sign-in]]/page.tsx            Clerk <SignIn/>
    verify/[token]/page.tsx                    S: public verify (+ client upload widget)
  pending/page.tsx                             S: signed in, no role / inactive
  finance/page.tsx                             S: redirect("/admin/finance")
  (app)/
    layout.tsx                                 S: app shell (Sidebar + Header), dev role switcher only in development
    admin/layout.tsx                           S: requireRole("super_admin")
    admin/page.tsx                             overview (KPIs, radar, trips today, category chart)
    admin/fleet/page.tsx                       full radar
    admin/finance/page.tsx                     invoices (was tab "invoices")
    admin/contracts/page.tsx                   contracts (was tab "contracts")
    admin/categories/page.tsx                  categories
    admin/alerts/page.tsx                      alerts
    admin/(later) trips, facilities, users, fleet, settings …
    hospital/layout.tsx                        S: requireRole(hospital_admin|hospital_staff) + facility scope
    hospital/page.tsx                          overview (+ truck-at-the-door card)
    hospital/waste/page.tsx                    waste records (was tab "manifests")
    hospital/certificates/page.tsx             certificates
    hospital/invoices/page.tsx                 hospital_admin only (layout or page-level guard)
    driver/layout.tsx                          S: requireRole("driver"), mobile shell
    driver/page.tsx                            today's trip
    driver/upcoming/page.tsx                   upcoming trips
    disposal/layout.tsx                        S: requireRole("disposal_operator"), mobile/tablet shell
    disposal/page.tsx                          queue
    disposal/inbound/page.tsx                  inbound trucks
    disposal/exceptions/page.tsx               missing & refused
    regulator/layout.tsx                       S: requireRole("efda_officer")
    regulator/page.tsx                         analytics
    regulator/audit/page.tsx                   audit ledger (+ chain check)
    regulator/certificates/page.tsx            certificates registry
    regulator/map/page.tsx                     route map / replay
  api/health/route.ts                          (Gate 1b)
```

Tabs become sub-routes. This fixes the sidebar `?tab=` links that do nothing today, makes every view linkable,
and lets each page be a Server Component. In Gate 1a the layouts only render the shell, with **no guard yet**, because the role still comes from the dev switcher.
The guards are added in Gate 1b.

### 5.2 Where each existing file goes

| Existing file | New path (Gate 1a) | `"use client"`? |
|---|---|---|
| `src/app/layout.tsx` | `src/app/layout.tsx` (html/body only) + shell moves to `src/app/(app)/layout.tsx` | No |
| `src/app/page.tsx` | same path; becomes a Server redirect in Gate 1b (stays client in 1a) | 1a yes → 1b no |
| `src/app/admin/page.tsx` | split: `(app)/admin/page.tsx`, `admin/fleet`, `admin/finance`, `admin/contracts`, `admin/categories`, `admin/alerts`. Table column definitions move to `src/components/admin/*-table.tsx` | Pages: no (after Gate 2). Tables/charts: yes |
| `src/app/hospital/page.tsx` | `(app)/hospital/page.tsx`, `hospital/waste`, `hospital/certificates`, `hospital/invoices`; columns → `src/components/hospital/*` | Pages no; tables yes |
| `src/app/driver/page.tsx` | `(app)/driver/page.tsx`, `driver/upcoming/page.tsx`; stop card → `src/components/driver/stop-card.tsx` | Page no; stop card + actions yes |
| `src/app/disposal/page.tsx` | `(app)/disposal/page.tsx`, `disposal/inbound`, `disposal/exceptions`; columns → `src/components/disposal/*` | Pages no; tables yes |
| `src/app/regulator/page.tsx` | `(app)/regulator/page.tsx`, `regulator/audit`, `regulator/certificates`, `regulator/map`; filters → `src/components/regulator/filters.tsx` (URL search params) | Pages no; filters/chart/table yes |
| `src/app/finance/page.tsx` | same path, server `redirect("/admin/finance")` | No |
| `src/app/pending/page.tsx` | same path (outside `(app)`) | No (after 1b) |
| `src/app/sign-in/[[...sign-in]]/page.tsx` | `(public)/sign-in/[[...sign-in]]/page.tsx` | Clerk component (client internally) |
| `src/app/verify/[token]/page.tsx` | `(public)/verify/[token]/page.tsx` | Page no; upload widget yes |
| `components/shared/sidebar.tsx` | same; links → sub-routes; nav from `ROLE_CONFIGS` | Yes (usePathname) |
| `components/shared/header.tsx` | same; dead buttons hidden | Yes (only for role switcher) |
| `components/shared/role-switcher.tsx` | `src/components/dev/role-switcher.tsx`, rendered only when `NODE_ENV === "development"` | Yes |
| `server/auth/session-provider.tsx` | `src/components/dev/dev-role-provider.tsx` (it is client code and must not live in `src/server`) | Yes |
| `server/auth/current-user.ts` | same path; rewritten in Gate 1b (Clerk + DB, throws `AppError`) | No (`server-only`) |
| `components/shared/data-table.tsx` | same; later re-based on TanStack Table with server pagination | Yes |
| `components/shared/facility-map.tsx` | replaced by `src/components/maps/fleet-map.tsx` (react-leaflet, `dynamic(..., { ssr: false })`) in Gate 4. Kept as-is in 1a | Yes |
| `components/shared/status-badge.tsx`, `kpi-card.tsx`, `page-header.tsx`, `empty-state.tsx` | same | No |
| `components/shared/error-state.tsx` | same (has `onRetry`) | Yes when `onRetry` is used |

### 5.3 Role picker policy

- Gate 1a: the switcher still drives everything (no auth yet), but it is moved under `src/components/dev/` and hidden
  in production builds.
- Gate 1b and later: roles come only from `users`. In development, the switcher becomes a "sign in as seeded test user"
  helper (seeded Clerk test users + `pnpm user:assign`), never a client-side override of the server role.

### 5.4 Mobile-first and maps

- `/driver` and `/disposal` get their own layouts: no sidebar, bottom action bar, touch targets ≥ 48 px, one main action per screen.
- Leaflet is loaded only on `admin/fleet`, the admin overview radar widget, `regulator/map` and (optionally) the driver stop map,
  via `next/dynamic` with `ssr: false`.

---

## Step 6 — Quality review (not fixed)

| Area | Finding | Where |
|---|---|---|
| Client components | All 11 pages are `"use client"`, and the root layout is wrapped in a client provider, so no page can be a Server Component that reads data | `src/app/**/page.tsx`, `layout.tsx` |
| Client code in `src/server` | `session-provider.tsx` is a client component inside `src/server/auth` | `src/server/auth/session-provider.tsx` |
| Large components | `admin/page.tsx` 521 lines (6 tabs, 3 column sets); `regulator/page.tsx` 361; `hospital/page.tsx` 308 | pages |
| Duplicated UI | Tab-bar markup copied in 5 pages; MoH colour switch copied in hospital + disposal (and inconsistent fallback colours `#71717a` vs `#b45309`); invoice/certificate columns defined twice | pages |
| Dead navigation | Sidebar `?tab=` links do nothing (pages ignore search params); `/admin?tab=settings` and `/driver?tab=stops` tabs do not exist | `sidebar.tsx` |
| Buttons for non-existent features | Header search, theme, bell, settings; sidebar "System Settings"; "Tap cards to inspect details" | `header.tsx`, `sidebar.tsx`, driver page |
| Hard-coded strings and fake values | KPI trends, "2 Active Drivers", "> 3 days", "1150°C", "+14.2% Growth", "100% compliant", sidebar "Verified 100%" / "LIVE", map "Battery 90%", "today" = `2026-10-03` | many |
| Money | `amountEtb.toLocaleString()` on floats; no santim; no shared `money.ts` | admin, hospital |
| Dates | `new Date(...).toLocaleDateString()` / `toLocaleTimeString()` uses the browser time zone (not EAT); raw date strings printed directly; no `src/lib/dates.ts` | admin, hospital, disposal, regulator |
| Accessibility | Status badges have text (good). Category shown by **colour dot + name** (OK). Tab buttons have no `role="tab"`/`aria-selected`; selects have no `<label>`; the header search has no label; the role switcher opens on **hover only** (not keyboard/touch); map pins are clickable `div`s (not buttons); `text-[10px]`/`[11px]` text and small tap targets on the driver page; many `zinc-500` on near-black texts may fail contrast | pages, header, role-switcher, facility-map |
| Mobile | Driver and disposal pages render inside the desktop sidebar layout (`w-64` fixed sidebar), so they are unusable on a 5-inch phone. The disposal tables are wide | layout.tsx |
| 3G performance | All mock data (every facility, trip, invoice, audit row) is bundled into the client JS; Recharts is loaded on admin and regulator pages up front; no pagination on the server; the `animate-ping` / `animate-pulse` effects keep running. After the DB switch: server pagination, per-widget Suspense, dynamic import of charts/maps | all |
| Type safety | `as any` on tab ids, `useState<any>` in map, `Record<string, any>` in audit metadata | pages, facility-map |
| Env validation | `src/env.ts` gives defaults for secrets, so missing keys never fail | `src/env.ts` |
| Lint | No ESLint config, so lint has never run | root |
| Security (prototype) | Any visitor can pick any role; `/verify` shows a valid certificate for any token; mock personal-looking data (names, phones, emails) is shipped to the browser. All of this is fictional, but it must not reach production | various |

---

## ASSUMPTIONS and open questions

Status after the review of 7 Oct 2026 (decisions recorded in `CLAUDE.md` §2 and §9):

1. ~~ASSUMPTION: `invoices.due_date` is added~~ → **DECIDED:** `invoices.due_date`, set when the invoice is ISSUED (issue date + `invoice_due_days`).
2. ~~ASSUMPTION: a contract has no human code~~ → **DECIDED:** `contracts.contract_code` `CT-YYYY-NNNN`.
3. ~~Waste category extra fields~~ → **DECIDED:** dropped; categories keep `code`, `name`, `colour_code`, `active`.
4. **ASSUMPTION (still open):** `vehicles.model` may be added; battery is **DECIDED: dropped**; payload and IMEI are not in scope.
5. **ASSUMPTION (still open):** the trip-stop planned time (`plannedArrival`) is not stored in V1 (§6.2 has only `planned_date`).
6. ~~Certificate witness~~ → **DECIDED:** dropped.
7. ~~Incinerator temperature / emissions~~ → **DECIDED:** dropped.
8. ~~Facility address and estimate~~ → **DECIDED:** keep `city`, `sub_city`, `woreda`, `kebele` (optional); drop `monthlyWasteEstimateKg`.
9. ~~pnpm~~ → **DECIDED:** npm stays (`package-lock.json` kept). No git: change logs in `docs/changes/`.
10. ~~ESLint~~ → **DECIDED:** Next.js Strict preset (`next/core-web-vitals` + `next/typescript`).
