# Change log — public home page

10 Oct 2026. Owner request: a home page modelled on the structure of rubicon.com (design inspiration only; own
SafeWaste text and look, photos only, no video). Clerk sign-up is postponed by the owner ("forget about the clerk
part for now").

| File | Action | Why |
|---|---|---|
| `src/app/page.tsx` | changed | signed-in users still go to their area (or /pending); visitors now see the home page instead of a redirect to sign-in |
| `src/components/home/home-page.tsx` | created | utility bar, navigation, hero, value statement + three pillars, how it works (5 steps), who we serve, oversight band, certificate check, closing call to action, footer. No invented figures, contacts or social links |
| `src/components/home/photo.tsx` | created | photo slot from `public/home/…`; a dark gradient shows until the photo file exists |
| `src/components/home/verify-box.tsx` | created | paste a certificate link or code → `/verify/<code>` |
| `public/home/` | created (empty) | photos: `hero.jpg`, `facilities.jpg`, `transport.jpg` |
| `tests/e2e/routes.spec.ts` | changed | `/` shows the home page and its Sign in link; the certificate box opens the verify page and rejects nonsense |

How to undo: restore `src/app/page.tsx` and `tests/e2e/routes.spec.ts` from the backup, delete `src/components/home/`
and `public/home/`.
