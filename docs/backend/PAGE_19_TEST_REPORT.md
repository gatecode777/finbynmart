# Page 19 test report

Only tests that were actually run are listed. Date: 2026-11-03. Production build (`.next-audit`), `next start` on port 3100, throwaway database `finbynmart_test` (test users, tokens and support requests removed by the suite; the database is dropped at the end of the work session), Chrome (puppeteer-core) on Windows.

## Executed

| Suite | Result |
|---|---|
| `15-buyer-registration-test.mjs`, MODE=mail (server with a local stand-in email provider and `APP_URL`) | **63/63** (includes M, F and G groups) |
| Same file, MODE=nomail (no provider configured; registration, supplier registration, support requests, pages, browser flows, 16-width responsive) | **113/113** |
| `15-buyer-registration-unit-test.mjs` (rules) | 72/72 (run earlier in the session; the rules module did not change afterwards) |
| `backend-pages-1-4`, `backend-pages-1-4-ui`, `site-functional-regression`, `13-contact-inquiry` re-run against the final build | 63/63, 21/21, 37/37, 240/240 |
| Full regression of Pages 02-14 against the previous build | all passed (one flaky rate-limit assertion in Page 12 was rewritten to check the first 429 and then passed 255/255) |
| `npx tsc --noEmit`, ESLint on every touched directory, production build | passed |

Page 19 coverage by PRD section: email validation (A-20..23, G-09, G-10, F-16), enumeration (F-01, F-02, F-15, G-15, G-17), tokens (M-04..M-07, F-03..F-11, G-06, G-07, G-12, G-13), email (G-03..G-05, M-03..M-05, M-22, M-23, M-27), resend (G-01, G-02, F-14, F-14b, M-17..M-20), buyer and supplier (F-01..F-13 buyer, G-14 supplier), API security (G-08..G-11, M-27), frontend (G-16..G-19, F-07, F-08), integration with the reset page (F-07..F-11, G-14), responsive (R-01 to R-03 at 16 widths, 320 to 2560, on `/forgot-password`, `/register/buyer`, `/contact-us`).

## Not run

Lighthouse, an automated contrast check, screen readers, Firefox and Safari, real mobile devices, landscape orientation, browser zoom 80-200%, real email delivery (no provider), mail-client rendering, a load test of the recovery endpoints, separate timing of lookup, token generation, persistence and provider call (only whole-request time was measured: 103 ms for a registered address and 105 ms for an unregistered one, median of five, including three limiter writes to Atlas about 30 ms away).

## Screenshots

`docs/page-reports/screenshots/19-forgot-password-desktop-1440.png`, `-tablet-820.png`, `-mobile-390.png`.

## Re-running

Build and serve with `TEST_DB=finbynmart_test bash docs/page-reports/tools/build-and-serve-test.sh`; for MODE=mail restart with `bash docs/performance/tools/restart-server.sh FINBYN_PUBLIC_CACHE_MS=0 EMAIL_API_KEY=test-key EMAIL_FROM=noreply@finbyn.test EMAIL_API_URL=http://127.0.0.1:3199/emails APP_URL=http://localhost:3100` and run `MODE=mail SERVER_LOG=<path of the server log> node 15-buyer-registration-test.mjs`.
