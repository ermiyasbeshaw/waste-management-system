# Change log — Gate 5 (disposal and certificates)

Started 10 Oct 2026. No git; this file replaces commit history for Gate 5. Secret values are never written here.
Owner instruction (10 Oct 2026): "continue with all sub don't stop until done" — tasks 5.1–5.5 are built in one go.

## 5.1 Receipt — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/lib/validation/disposal.ts` | created | container code, MISSING / REFUSED with reason (3–500 chars), destruction method, close reason, revoke (+ reissue) |
| `src/server/services/disposal.ts` | created | `receiveContainer`, `recordContainerException`: operator of the DISPOSAL_SITE only; container must be COLLECTED; disposal record opened at the first check-in; waste IN_TRANSIT → RECEIVED once nothing of it is still on the truck; trip COMPLETED (and vehicle / driver freed) once nothing is left on board — DECISION v1.2 |
| `src/app/api/disposal/receive/route.ts`, `exception/route.ts` | created | commands with Idempotency-Key (request pipeline unchanged) |
| `src/server/queries/disposal.ts` | changed | shared site check; `getDisposalWork`: containers on the trucks, waste ready for destruction, active methods |
| `src/types/view-models/disposal.ts` | changed | `OnBoardContainer`, `ReadyWaste`, `DisposalWork` |
| `src/components/driver/scanner.tsx` | changed | optional `url` and result text, so the site reuses the QR scanner (driver behaviour unchanged) |
| `src/components/disposal/receipt-desk.tsx` | created | scan / type to check in; "Missing / refused…" with a required reason |
| `src/app/(mobile)/disposal/inbound/page.tsx` | changed | receipt desk above the inbound trucks |

## 5.2 Destruction — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/server/services/disposal.ts` | (same file) | `destroyWaste`: waste RECEIVED; the disposal record is locked FIRST (method + time, trigger keeps it unchangeable), then containers DESTROYED, waste DISPOSED or DISPOSED_WITH_EXCEPTION, certificate PENDING — one transaction; the PDF comes after the commit. `closeWithoutDestruction`: only when no container was received; reason; no certificate (DECISION v1.2) |
| `src/app/api/disposal/waste/[id]/destroy/route.ts`, `close/route.ts` | created | commands with Idempotency-Key |
| `src/components/disposal/destruction-desk.tsx` | created | per waste: method + confirmation, or close with reason |
| `src/app/(mobile)/disposal/page.tsx` | changed | destruction desk above the queue |
| `src/types/view-models/admin.ts`, `src/server/queries/admin.ts`, `src/components/admin/alerts.tsx` | changed | alert "Disposal exceptions (last 30 days)": containers missing / refused, waste closed without destruction (with the audited reason), certificates whose generation failed |

## 5.3 Certificate generation — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/server/integrations/pdf/certificate.ts` | created | PDF: number, issue date, facility, Waste ID, category, weight, destruction date and method, destroyed containers, exceptions with reasons, QR with the verify URL only. No person names |
| `src/server/integrations/storage.ts` | created | `StorageProvider`; development adapter writes to `STORAGE_DIR` (default `.storage`, git-ignored). Production storage: Gate 7.4 |
| `src/lib/env-schema.ts`, `.env.example`, `.gitignore` | changed | `STORAGE_DIR` (optional) |
| `src/server/services/certificates.ts` | created | `createPendingCertificate` (number CD-YYYY-NNNNN, random verify token), `generateCertificate` (render → store → SHA-256 → ISSUED; failure → FAILED with the error, attempts counted, destruction untouched), `processCertificateQueue`, `runCertificateJobNow` (super_admin, audited) |
| `src/server/outbox/templates.ts` | changed | `certificate.issued` email to the facility's hospital administrators (ASSUMPTION: administrators only; English text) |
| `src/app/api/jobs/certificates/route.ts` | created | `POST` with CRON_SECRET: PENDING and FAILED → generate (FAILED → ISSUED retry) |

Generation also starts right after the destruction commit (best effort, like the outbox); it is off when
`OUTBOX_DISPATCH_AFTER_COMMIT=0` (tests), where the job / the test runs it.

## 5.4 Public verification — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/app/api/verify/[token]/check-file/route.ts` | created | public; multipart or raw PDF ≤ 10 MB; compares SHA-256; the file is not kept; 10 requests / minute per address (ASSUMPTION) |
| `src/app/api/verify/[token]/pdf/route.ts` | created | public download of an ISSUED certificate only (PENDING / FAILED / REVOKED: none); audited; 30 / minute per address |
| `src/components/verify/file-check.tsx` | created | "Check a certificate file" on the verify page |
| `src/app/(public)/verify/[token]/page.tsx` | changed | download button (ISSUED only) and the file check; still only the DECISION fields |
| `src/server/queries/verify.ts` | changed | comment only |

## 5.5 Download, revoke, reissue — done 10 Oct 2026

| File | Action | Why |
|---|---|---|
| `src/app/api/certificates/[id]/pdf/route.ts` | created | signed-in download: super_admin and EFDA officer for all, hospital roles for their own facility (checked in SQL); audited. The app streams the file (the dev storage has no signed URLs; a signed URL comes with the production storage) |
| `src/app/api/certificates/[id]/revoke/route.ts` | created | super_admin, reason, optional reissue (new PENDING row; the old one stays REVOKED); waste status unchanged |
| `src/app/(desk)/admin/certificates/{page,actions}.ts(x)`, `src/components/admin/certificates-admin.tsx` | created | every certificate (PENDING / FAILED first, with the error), revoke / reissue, "Generate / retry now" |
| `src/app/(desk)/admin/layout.tsx` | changed | "Certificates" tab |
| `src/components/hospital/columns.tsx`, `src/components/regulator/tables.tsx` | changed | download link (ISSUED / REVOKED), "Being prepared" otherwise |

## Tests

| File | What |
|---|---|
| `tests/integration/disposal.test.ts` | 7 tests: roles (EFDA / hospital / admin 403, operator without site 403); check-in → waste RECEIVED, trip COMPLETED, vehicle free, replay = one action, second check-in 409; unknown 404, not collected 409, reason 422; destruction lock (DB trigger refuses changes), DISPOSED_WITH_EXCEPTION, certificate ISSUED with matching SHA-256, changed file does not match, other facility 404, download audited; storage failure → FAILED, destruction kept, retry → ISSUED; nothing received → close with reason, no certificate; revoke (403 for others, reason required, reissue, waste unchanged, second revoke 409) |
| `tests/e2e/disposal.spec.ts` | operator UI: check-in by typing, missing with reason, trip completes, destruction → certificate prepared, hospital sees it; API: 400 without key, EFDA 403, replay, 409, 422; public file check mismatch and 404 |

## Incident during testing (10 Oct 2026)

The first version of the retry test ran the whole certificate job, which also issued the two seeded demo
certificates that are PENDING (CD-2026-00015) and FAILED (CD-2026-00016) on the `test` branch. The test now
retries only its own certificate, and both seeded certificates were put back to their seeded values on `test`
(values read from `dev`; `dev` was not changed). Their `certificate.issued` audit entries on `test` remain (the
log is insert-only).

## Test fixes found by the full run (10 Oct 2026)

| File | Action | Why |
|---|---|---|
| `tests/integration/disposal.test.ts`, `tests/e2e/disposal.spec.ts` | changed | fixtures now write the pickup scan rows (NO PARTIAL PICKUP invariant) and never turn a container back to LABELLED |
| `tests/integration/seed-data.test.ts` | changed | IN_TRANSIT waste may already have RECEIVED / MISSING / REFUSED containers during the check-in; new check: it still has one COLLECTED |
| `tests/integration/regulator-queries.test.ts` | changed | facility volumes respect LIMIT 100; map speed may now come from GPS |
| `tests/integration/outbox.test.ts` | changed | the drain hook may take up to 10 min after a full run |
| `tests/e2e/routes.spec.ts`, `tests/e2e/tracking.spec.ts` | changed | selectors: the plate now appears twice on the inbound page; the trip picker's hidden option; the map test no longer depends on one plate being among the 10 shown |

Test data repaired on the `test` branch only (fixture waste `WR-99…`): 2 containers set back to COLLECTED and 27
missing scan rows added for fixture stops.

## Open points

- Seeded ISSUED demo certificates have no stored PDF (the seed only stored a placeholder hash), so their download
  says "file not available". New certificates download normally. A one-off dev script could render them; not done
  without approval because it changes stored hashes on `dev`.
- Production storage and signed URLs: Gate 7.4.

How to undo: restore the listed files from the pre-Gate-5 backup folder and delete the created files.
