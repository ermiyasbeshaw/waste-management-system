# Pilot checklist — Dire Dawa (Gate 7.5)

For the owner and the client. Tick each line before the pilot starts; the client signs the acceptance at the end.

## A. Before the pilot (owner / IT)

- [ ] Client confirms the v1.2 addendum DECISIONS (CLAUDE.md) and the open ASSUMPTIONS listed in
      `docs/changes/gate-3.md` … `gate-7.md` (billing rules, registration limits, renewal = new contract, …).
- [ ] Clerk production instance; staff invited (no public sign-up); MFA on for super_admin; each user's role and
      facility set in SafeWaste (Admin → Users).
- [ ] Phone verification works for +251 numbers (CLAUDE.md §11) — tested with two real hospital phones.
- [ ] Ethio Telecom SMS key installed; one pickup code received on a real phone.
- [ ] Email provider installed; one certificate email received.
- [ ] File storage for certificate PDFs on the host, with backup / versioning.
- [ ] Trackers fitted to both vehicles; tokens issued (Admin → Fleet & Licences); positions visible on the map.
- [ ] Scheduled jobs running (see `docs/runbooks/operations.md` §1); `/api/health` monitored.
- [ ] Restore drill done and recorded (`docs/runbooks/operations.md` §3).
- [ ] Settings reviewed with the client (Admin → Settings): OTP expiry, geofence radius, VAT, due days, …
- [ ] Pilot facilities entered with correct coordinates; each has at least one hospital user who receives pickup
      codes (otherwise "not ready").
- [ ] Contracts entered (Admin → Contracts) with the agreed monthly fees.
- [ ] Licences of vehicles, drivers, facilities and the disposal site entered with expiry dates.
- [ ] Demo data removed from production (production starts empty except reference data).

## B. Dry run (one day, one facility)

- [ ] Hospital registers waste, prints labels, sticks them on the containers.
- [ ] Admin plans a trip; driver receives the trip email.
- [ ] Driver starts the trip, arrives (geofence result shown), scans every container, enters the SMS code.
- [ ] Hospital sees "truck at the door"; the in-app confirmation works when SMS is not received.
- [ ] Disposal site checks every container in; one container marked missing with a reason for the test.
- [ ] Destruction recorded; certificate issued; the hospital downloads it; the public QR link shows "valid";
      the "check a certificate file" upload says it matches.
- [ ] EFDA officer sees the facility, the route replay and the audit log; "Verify the hash chain" says intact.
- [ ] Monthly invoice created, issued, the hospital administrator downloads it; payment recorded.

## C. Acceptance (client)

| Area | Accepted by | Date | Remarks |
|---|---|---|---|
| Waste registration and labels | | | |
| Pickup (codes, scans, in-app, override) | | | |
| Tracking and maps | | | |
| Disposal and certificates | | | |
| Billing and exports | | | |
| Regulator oversight | | | |

Pending client requests (not part of this acceptance, CLAUDE.md §12): medicine stock and expiry alerts, EFDA
approval of medicine disposal.
