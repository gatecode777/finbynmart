# Page 38 — Test report

Date: 2026-11-11. Production build in `.next-audit`, port 3100, database `finbynmart_test` (dropped afterwards), headless Chrome via `puppeteer-core`. No email provider and no document-storage differences affected these runs except where noted.

| Suite | Result |
|---|---|
| `38-security-rules-unit-test.mjs` (`node --import ./docs/page-reports/tools/alias-register.mjs ...`) | 20/20 |
| `38-buyer-security-test.mjs` (final run, with performance) | **99/99** |
| `38-reset-session-test.mjs` (password reset ends every session) | 4/4 |
| `npx tsc --noEmit`, `npm run lint`, production build | clean / clean / passes |

Integration groups: **A** access, forged/tampered/expired cookies, session fixation, legacy-cookie compatibility · **B** the registry and the cookie (flags, hash-only storage, indexes, list, current marking, no leaks, expiry, last-active, 20-session cap) · **C** revocation (proof, repeat, current session, foreign/unknown/malformed ids, wrong methods, simultaneous requests, event/alert/notification once, CSRF) · **D** sign out other devices (real count, legacy cookie ended, this device kept with its record, other buyers untouched, the Settings button, rate limit) · **E** login activity (empty history, failed-attempt coalescing, logout, replay, paging 60 events, ties, bounds, isolation, no sensitive fields) · **F** alerts (new device, first sign-in, repeated failures, duplicate prevention, status, acknowledge, isolation, timeline) · **G** password (wrong/weak/mismatch/reuse, new hash, rotation, other devices ended, event/alert/notification, rate limit, no session) · **H** overview, no 2FA routes, recovery methods, indexes · **K** browser flows (page, cards, tabs and keyboard, URL state, 2FA tab has no controls, revoke and sign-out-others dialogs, revoked browser redirected to sign-in, login activity, alerts, password form, failure isolation, Settings link) · **R** responsive and accessibility structure at 16 widths, dialogs at 320 px, zoom equivalents · **P** performance and explain plans.

## Defects found and fixed during testing
- Real: the "See all login activity" link-button was under 32 px tall on phones (fixed to 44 px); the header buttons touched the cards on desktop (spacing added).
- Real design consequence, documented: the 20-session cap retires the *least recently used* session, and activity time is only written every 5 minutes, so the oldest sign-in can be retired first.
- Test-side corrections: Chrome was started at the top and was gone after the long API phase (now started on first use); cookies injected through Puppeteer were readable by page scripts (now HttpOnly like the real ones); the test's own session objects held cookies from before a version bump; registration sessions counted in some totals.

## Regression runs after the authentication change
| Suite | Result |
|---|---|
| Page 15 buyer registration | 113/113 |
| Page 22 dashboard | 96/96 |
| Page 23 profile | 102/102 after two expectations were updated (they asserted "device list not available", which Page 38 replaced) |
| Pages 24 addresses / 25–26 settings & notifications | 85/85 / 91/91 |
| Pages 27–28 inquiries / 29–30 quotations / 31 orders | 98/98 / 99/99 / 78/78 |
| Saved products / saved suppliers / compare products | 40/40 / 66/66 / 60/60 |
| Page 36 support (no performance group) / Page 37 ticket details (no performance group) | 72/72 / 89/89 |
Two earlier runs of Pages 23 and 25–26 failed document-upload checks only because the test server had been restarted without its document-storage directory; they passed once it was set. The `/api/health` route was checked by hand (200 `{"ok":true}`, HEAD 200, POST 405, no database operations).

## Not run
Lighthouse, an automated contrast tool, screen readers, Firefox, Safari, real devices, landscape orientation, real browser zoom (viewport equivalents were tested), `AUTH_REQUIRE_SESSION_REGISTRY=1`, a password-reset test through a real email (none can be sent; the token was inserted directly), the pages 05–13 and 16–21 suites (no scripts for the account-recovery pages exist in the repository; the reset path was covered by the new reset test), load tests, tests against a hosted/production database.
