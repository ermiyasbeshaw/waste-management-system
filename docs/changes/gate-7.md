# Change log — Gate 7 (production readiness)

Started 10 Oct 2026. No git; this file replaces commit history for Gate 7. Secret values are never written here.
Owner instruction (10 Oct 2026): "continue with all sub don't stop until done".

## 7.1 Permission matrix

| File | Action | Why |
|---|---|---|
| `tests/permissions/matrix.test.ts` | created | Appendix C (as narrowed by CLAUDE.md §3) as tests: 6 roles × 72 services / queries — denied → 403; allowed → passes the role check (invalid input / unknown IDs, so nothing is changed); efda_officer refused by every write; every role has a function |
| `vitest.integration.config.ts` | changed | runs `tests/permissions/**` with the integration tests |
| `src/server/services/exports.ts` | changed | **bug found by the matrix**: the format was validated before the role check (unauthorised roles got 422 instead of 403) |

**OPEN QUESTION — Appendix C allows more than CLAUDE.md §3** (CLAUDE.md applied; the owner decides):
1. Driver: route replay / map of own trips (Appendix C "R(own)").
2. Disposal operator: view / download certificates, and exports (Appendix C "R").
3. EFDA officer: read contracts and invoices (Appendix C "R").
4. Driver / disposal operator: exports of their own data (Appendix C "Dashboards and exports").

## Gaps found and closed (V1 scope, CLAUDE.md)

| File | Action | Why |
|---|---|---|
| `src/server/services/waste.ts`, `src/app/(desk)/hospital/waste/actions.ts`, `src/components/hospital/cancel-waste.tsx`, `src/components/hospital/columns.tsx` | changed / created | **waste cancellation was missing** (CLAUDE.md §5): REGISTERED / SCHEDULED → CANCELLED with reason, own facility, 409 while the stop is ARRIVED; a scheduled record leaves its stop. ASSUMPTION: the only waste on a planned stop cannot be cancelled until the Super Administrator skips the stop (the transition table lets only the driver / super_admin skip) |
| `tests/integration/waste-cancel.test.ts` | created | 3 tests |
| `src/server/services/settings.ts`, `src/app/(desk)/admin/settings/{page,actions}.ts(x)`, `src/components/admin/settings-editor.tsx`, `src/app/(desk)/admin/layout.tsx` | changed / created | **settings editing was missing** (CLAUDE.md §7: super_admin, audited): validated per key, audit `setting.updated`; `label_amharic_enabled` stays locked until Amharic labels exist (wording + font) |
| `src/app/api/health/route.ts` | created | **`GET /api/health` was missing** (CLAUDE.md §6): database round trip + version, no data; 503 when the database is unreachable |
| `tests/e2e/jobs.spec.ts` | changed | health check test |

## 7.2 Security review

| File | Action | Why |
|---|---|---|
| `next.config.mjs` | created | security headers (see `docs/security-review.md`); `X-Powered-By` off |
| `package.json`, `package-lock.json` | changed | `next` and `eslint-config-next` 14.2.25 → 14.2.35 (security releases of the fixed 14.2 line; exact pin) |
| `docs/security-review.md` | created | checklist with evidence; dependency audit; open items (full CSP after Clerk, shared rate limiter with the host, Next major upgrade decision) |

## 7.3 Failure paths

| File | Action | Why |
|---|---|---|
| `tests/e2e/failures.spec.ts` | created | reassignment: the former driver loses access at once; the new driver starts the trip. The other failure paths are already covered (listed in the file) |

## 7.4 Providers, backup / restore, monitoring

| File | Action | Why |
|---|---|---|
| `docs/runbooks/operations.md` | created | job schedule, monitoring signals, Neon restore drill, providers still to connect |

Not done (needs the owner's accounts): Ethio Telecom SMS adapter, email adapter, production storage, tracker
vendor adapter, Clerk production. The restore drill needs the Neon console (owner).

## 7.5 Pilot

| File | Action | Why |
|---|---|---|
| `docs/pilot.md` | created | before-pilot checklist, one-day dry run, client acceptance table |

## Fix after the final run

| File | Action | Why |
|---|---|---|
| `src/server/services/settings-admin.ts`, `src/server/services/settings.ts` | created / changed | settings editing moved out of `settings.ts`: every service imports `settings.ts` to read values, and the sign-in code it needed broke three test files |
| `tests/integration/billing.test.ts` | changed | the "end before start" case had become a valid date after moving the fixtures to 2098 |

## Final checks (10 Oct 2026)

typecheck ✔ · lint ✔ · unit 148/148 ✔ · build ✔ · e2e 89/89 ✔ · integration 232/234 in the full run; the 3 files that
failed to load and the billing case were fixed and rerun (97/97 ✔, plus clerk-sync 2/2, waste-cancel 3/3,
matrix 74/74).

Known test-branch limit: repeated full runs on 10 Oct used all 99 trip numbers of that day on the `test` branch
(`TR-261010-01…99`, the CLAUDE.md §9 format allows 99 a day). The pickup tests that plan trips then stop with
CODE_SEQUENCE_EXHAUSTED — not a code fault; they pass on another day or after "Reset from parent" of the `test`
branch in the Neon console.

How to undo: restore the listed files from the pre-Gate-7 backup folder and delete the created files.
