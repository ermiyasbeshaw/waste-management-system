# Test users (Clerk Development instance only)

No passwords are stored here. Test accounts use Clerk's development test mode:

- Any email containing `+clerk_test` receives **no real email**; its verification code is always **424242**.
- Test phone numbers **+1 555 555 0100 … 0199** also use code **424242** (useful for phone-verification tests).
- These only work on the **Development** instance. Never use them in production.

Accounts are created by the owner in the Clerk dashboard (**SafeWaste → Users → Create user**); creating a user
there bypasses the invite-only access mode. Sign-in method needed: **Email verification code**
(Configure → User & authentication → Email).

Roles and facilities are **not** stored in Clerk. They live in the `users` table and are assigned with
`npm run user:assign` (Gate 1b.7), which reads this table.

| # | Role | Email | Facility (code) |
|---|---|---|---|
| 1 | super_admin (owner) | owner's real email | — |
| 2 | super_admin | `admin+clerk_test@example.com` | — |
| 3 | hospital_admin | `hospital.admin+clerk_test@example.com` | Dil Chora Referral Hospital (`DD-REF-001`) |
| 4 | hospital_staff | `hospital.staff+clerk_test@example.com` | Sabian General Hospital (`DD-GEN-002`) |
| 5 | driver | `driver+clerk_test@example.com` | — (linked to driver profile in Gate 2) |
| 6 | disposal_operator | `disposal+clerk_test@example.com` | Dire Dawa Central Disposal Plant (`DD-DIS-018`, DISPOSAL_SITE) |
| 7 | efda_officer | `efda+clerk_test@example.com` | — |

Sign in at http://localhost:3000/sign-in with a test email, then enter code `424242`.

## Troubleshooting

- **"Couldn't find your account"** — the account does not exist yet. Create it first in the Clerk dashboard
  (Users → Create user). Sign-in never creates accounts (access mode is invite-only).
- **"Identifier is invalid"** — Clerk rejected the address format. Use `…+clerk_test@example.com` (a real public
  domain); an earlier version of this list used `@safewaste.test`, which Clerk does not accept.
- Phone sign-in: only numbers already added to an account work; for tests use +1 555 555 0100…0199 (code 424242).

## Account details for "Create user" (Clerk Development app ace-malamute-8202)

Same password for all six **test** accounts (dev instance only; never reuse it anywhere real):

`Test password: 4SexKtMAnCJ!VQC3F5`

| First name | Last name | Email | Phone (Clerk test number, code 424242) | Password |
|---|---|---|---|---|
| Nebiyu | Ermiyas | owner's own email | leave empty (add your real phone later) | your own password |
| Test | Admin | `admin+clerk_test@example.com` | +1 555 555 0101 | Test password above |
| Aster | Tadesse | `hospital.admin+clerk_test@example.com` | +1 555 555 0102 | Test password above |
| Genet | Alemu | `hospital.staff+clerk_test@example.com` | +1 555 555 0103 | Test password above |
| Abebe | Kebede | `driver+clerk_test@example.com` | +1 555 555 0104 | Test password above |
| Kassahun | Worku | `disposal+clerk_test@example.com` | +1 555 555 0105 | Test password above |
| Tariku | Haile | `efda+clerk_test@example.com` | +1 555 555 0106 | Test password above |

Phone format in the Clerk form: country **United States (+1)**, number **555 555 0101** (etc.). If the form has no
phone field, phone sign-in is not enabled on this app yet — leave it empty.

## Usernames and routes (planned)

Created by `npm run users:create-test` (scripts/create-test-users.mjs) with **username + the Test password above**.
Before running it, in the Clerk app turn on **Username** and **Password** (Configure → User & authentication).

| Username | Email | Role | Route after sign-in | Facility |
|---|---|---|---|---|
| `sw_admin` | `admin+clerk_test@example.com` | super_admin | `/admin` | — |
| `sw_hospital_admin` | `hospital.admin+clerk_test@example.com` | hospital_admin | `/hospital` | DD-REF-001 |
| `sw_hospital_staff` | `hospital.staff+clerk_test@example.com` | hospital_staff | `/hospital` | DD-GEN-002 |
| `sw_driver` | `driver+clerk_test@example.com` | driver | `/driver` | — |
| `sw_disposal` | `disposal+clerk_test@example.com` | disposal_operator | `/disposal` | DD-DIS-018 |
| `sw_efda` | `efda+clerk_test@example.com` | efda_officer | `/regulator` | — |

These rows are for **Clerk sign-in, which comes last** (owner's decision, 8 Oct 2026): a Clerk account reaches its
route only once it is linked to a `users` row with a role (`npm run user:assign`, Gate 1b.7); until then it sees
`/pending`. The **dashboard test logins below already work** — they use the seeded `dev_<role>` users.

<!-- dashboard-logins:start -->
## Dashboard test logins (no Clerk) — generated 2026-10-08T19:37Z

Open **http://localhost:3000/dev-login**, enter the username and password, and the dashboard of that role opens.
Works only on the local dev server (`npm run dev`); production uses Clerk. Regenerate with `npm run dev:accounts`.
Test passwords only — never reuse them anywhere real.

| Dashboard | Username | Password | Signs in as | Opens |
|---|---|---|---|---|
| super_admin | `sw_admin` | `ZNTB-kBZP-ccSC-q7Qw` | Nebiyu Platform Admin | `/admin` |
| hospital_admin | `sw_hospital_admin` | `qaAE-J4SF-TgPN-kBYS` | Dr. Aster Tadesse (Dil Chora Referral Hospital) | `/hospital` |
| hospital_staff | `sw_hospital_staff` | `T6xf-V8Xo-GM7i-yqUb` | Sr. Genet Alemu (Sabian General Hospital) | `/hospital` |
| driver | `sw_driver` | `9kPS-ibs2-ayr3-VQ2m` | Abebe Kebede | `/driver` |
| disposal_operator | `sw_disposal` | `Nrqr-W35d-Rjw2-CqXy` | Eng. Kassahun Worku (Disposal Site) | `/disposal` |
| efda_officer | `sw_efda` | `Efzx-EogT-WxDQ-CgSy` | Tariku Haile (EFDA) | `/regulator` |
<!-- dashboard-logins:end -->
