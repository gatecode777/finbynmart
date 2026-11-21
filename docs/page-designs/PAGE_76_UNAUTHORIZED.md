# Page 76 — Unauthorized / Sign-in Required

Route: `/unauthorized` · Portal: PUBLIC · Tracker ID 76. A recovery page: "Sign-in required / Please sign in to continue." Public, `noindex`, `force-dynamic`, no private data, no database call.

## Behaviour
- `?next=` is validated by the ONE shared rule `safeReturnPath` (`src/lib/auth/safeReturn.ts`). Sign In goes to `/sign-in?next=<validated path>` (plain `/sign-in` when unsafe or absent). Go to Homepage is a plain link. "Join as a Buyer" appears only for a public or buyer destination, never for admin or supplier ones.
- A signed-in visitor is not shown the page: they follow the existing landing rule (`resolvePostLoginPath`), so there is no sign-in loop.
- The page is rendered bare (own brand header/footer): `SiteChrome` treats `/unauthorized` as chrome-free.
- No route redirects here automatically: protected pages still go straight to `/sign-in` with their own path and APIs answer 401/403 JSON (test 70).
- HTTP status is **200**, honestly documented: Next.js App Router has no stable API to return 401 for a page without the experimental helper.

## The shared safe-return rule
Rejected: non-string, empty, over 300 characters, control characters, backslashes, not starting with a single `/`, `//`, values that decode (twice) to those, characters outside the site's route alphabet (raw), origin changes, `/api/`, and the sign-in journey itself (`/unauthorized`, `/maintenance`, `/forbidden`, `/sign-in`, `/sign-up`, `/login`, `/register*`, `/forgot-password`, `/reset-password`, `/password-reset`, `/verify-email`). Query parameters whose names look like credentials or one-time values (token, password, secret, session, auth, api key, otp, code, key, sid) are dropped. It is applied at receipt (`/unauthorized`, `/sign-in`), in the login API (`safeNext`) and again at the final redirect (`resolvePostLoginPath`). The result grants nothing: the destination enforces session, role and ownership itself.

## Tests actually run
- `90-unauthorized-redirect-unit-test.mjs`: 12 checks (valid paths normalised, ~60 hostile values refused, sensitive-parameter stripping, `safeNext` equivalence, post-login re-validation, page contracts, chrome, no automatic redirects).
- HTTP on a production build (OFF server): `/unauthorized?next=/admin/audit-logs` and `/supplier/dashboard` carry the path and show NO Join link; `/buyer/orders?token=a&page=2` carries `/buyer/orders?page=2` with Join; `/maintenance` and `/products` handled as expected; `no-store`, `noindex`.
- Browser (real Chrome, production build, no session) at 320, 360, 390, 430, 768, 1024, 1280, 1440 and landscape 844x390 / 640x360: one h1, no horizontal overflow, logo loads, keyboard Tab reaches skip link then the actions. Screenshots in `docs/page-reports/screenshots/76-unauthorized-*.png`. Script: `92-pages-76-78-browser-check.mjs`.

## Not verified
A complete sign-in journey with a real account (no isolated database), 200% zoom (only narrow-width equivalents), screen-reader testing, Firefox/Safari/real devices.
