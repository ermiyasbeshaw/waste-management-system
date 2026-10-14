# Operations runbook — SafeWaste

For the person who runs the system (owner / IT). Written 10 Oct 2026 (Gate 7.4). Secret values never go in this
file.

## 1. Scheduled jobs

All jobs are `POST` with the header `Authorization: Bearer <CRON_SECRET>`. They return counts only and are safe to
run twice. Times are Africa/Addis_Ababa (EAT).

| Job | URL | When | What it does |
|---|---|---|---|
| Outbox | `/api/jobs/outbox` | every minute | sends waiting SMS / email; retries 1 / 5 / 15 / 60 min; FAILED after `outbox_max_attempts` (admin alert) |
| Certificates | `/api/jobs/certificates` | every 5 minutes | generates PENDING certificates, retries FAILED ones |
| Daily checks | `/api/jobs/daily-checks` | every day 02:00 | contract statuses, certificate retries, idempotency-key clean-up, alert counts |
| Monthly invoices | `/api/jobs/monthly-invoices` | 1st of the month 06:00 | DRAFT invoices for the previous month (body `{ "month": "YYYY-MM" }` to choose a month) |

The hosting provider's scheduler (or any cron service) calls these URLs. Example:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/outbox`

## 2. Monitoring

| Signal | Where | Action |
|---|---|---|
| `GET /api/health` → 200 `{ status: "ok" }`, 503 when the database is unreachable | uptime monitor every minute | 503 for 3 minutes → check Neon status and the database URL |
| Failed SMS / email | Admin → Alerts → "Failed Messages" | check the provider account / credit; messages can be re-sent by a new action |
| Silent tracker during a trip | Admin → Alerts | check the tracker power / SIM; arrival evidence shows "no GPS" meanwhile |
| Disposal exceptions, failed certificates | Admin → Alerts | failed certificates retry automatically; "Generate / retry now" on Admin → Certificates |
| Server errors | structured JSON logs (`level: "error"`, `requestId`) | the user sees the request ID; search the logs for it |
| Audit log integrity | Regulator → Audit → "Verify the hash chain" | must say "intact"; anything else is a security incident |

## 3. Backup and restore (Neon)

Neon keeps a continuous history of the database (point-in-time restore within the plan's history window).

**Restore drill (do it before the pilot and every 3 months):**
1. Neon console → the project → Branches → **Create branch** from `main` (production) *at a past time*
   (e.g. one hour ago). Name it `restore-drill-YYYYMMDD`.
2. Copy that branch's connection string; set it as `DATABASE_URL` / `DATABASE_URL_UNPOOLED` of a local copy of the app
   (never of production).
3. Start the app, sign in, check: the latest waste records before the chosen time are there; Regulator → Audit →
   "Verify the hash chain" says intact.
4. Write the date, the chosen time and the result in `docs/runbooks/restore-log.md`; delete the drill branch.

**Real restore (data loss or corruption):** create a branch at the last good time as above, check it, then in Neon
make it the primary branch (or point the app's environment variables at it) and redeploy. Record what happened.

Certificate PDFs live in the file storage (Gate 7.4: the host's object storage). Its own backup / versioning must be
switched on in the host; a lost PDF can be regenerated only as a **reissue** (new number), because the stored hash
belongs to the original file.

## 4. Providers still to connect (owner decisions)

| Provider | Status | What is needed |
|---|---|---|
| Ethio Telecom SMS (pickup codes) | console provider (messages are logged, not sent) | API account and key from Ethio Telecom → an `SmsProvider` adapter in `src/server/integrations/messaging.ts`, keys as environment variables; test with Admin → a test SMS to one phone |
| Email (certificates, invoices, trip notices) | console provider | provider choice (any SMTP / API service) → `EmailProvider` adapter |
| File storage (certificate PDFs) | local folder `STORAGE_DIR` | the host's object storage → `StorageProvider` adapter in `src/server/integrations/storage.ts` |
| GPS trackers | generic JSON format + simulator | vendor choice → a `TrackingProvider` adapter in `src/server/integrations/tracking/provider.ts` |
| Clerk (sign-in, phone verification) | development test login | Clerk production instance, users, MFA for super_admin (done last, by owner decision) |
| Map tiles | OpenStreetMap public tiles (demo only) | a tile provider for production → `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION` |

## 5. Demo helpers (development only)

- GPS simulator: Admin → Fleet & Licences → "New token" for a tracker (shown once) → in a terminal set
  `SIM_TRACKER_TOKEN`, start the trip as the driver, then `npm run gps:simulate -- --device TRK-A48291` (add
  `--history` to back-fill the track from the trip start).
- Test logins: `/dev-login` with the accounts in `docs/test-users.md` (never in production).
