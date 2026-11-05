# Page 20 test report

Executed on 2026-11-03: production build (`.next-audit`), `next start` on port 3100, throwaway database `finbynmart_test`, Chrome through puppeteer-core. Only what ran is listed.

| Suite | Result |
|---|---|
| `15-buyer-registration-test.mjs` MODE=mail (local stand-in email provider, `APP_URL` set): groups M, F, G (Page 19) and **H (Page 20, H-00 to H-60)** | **124/124** |
| Same file MODE=nomail (no provider; registration, supplier, support, pages, responsive) | **113/113** |
| Rule unit tests | 72/72 |
| `backend-pages-1-4`, `backend-pages-1-4-ui`, `site-functional-regression`, `12-supplier-reviews`, `13-contact-inquiry`, `14-inquiry-confirmation` re-run after the session-version change | 63/63, 21/21, 37/37, 255/255, 240/240, 124/124 |
| `tsc --noEmit`, ESLint on every touched path, production build | passed |

Page 20 coverage by PRD section 27: token validation (H-01..H-09, H-37, H-38), single use and concurrency (H-14, H-19, H-36), password policy (H-26..H-35), hashing (H-11, H-13, H-18, H-33), account type and redirect (H-10, H-23..H-25), atomicity (H-14, H-36, H-37; fault injection not done), session revocation (H-12, H-17, H-20..H-22), URL security (H-40..H-45, H-08), frontend (H-43..H-56), Page 19 to Page 20 end to end through the browser (H-57), responsive at 16 widths 320-2560 with overflow, clipped checklist, controls-in-viewport and 40px touch targets (H-59), stage timings (H-58).

Stage timings from the server's own log (runs of 11 resets each, medians, includes ~30 ms per Atlas round trip): token lookup 57-61 ms, scrypt hash 40-73 ms, transaction 189-193 ms, total 291-335 ms. Under the 500 ms write target; the hash was not weakened. Session revocation costs no separate time (it is the `$inc` in the transaction).

Screenshots: `docs/page-reports/screenshots/20-reset-password-desktop-1440.png`, `-tablet-820.png`, `-mobile-390.png` (taken before the last cosmetic placeholder change).

## Not run

Lighthouse, automated contrast check, screen readers, Firefox and Safari, real devices, landscape orientation, browser zoom 80-200%, fault injection inside the transaction, rate-limit 429 on the reset and validate routes, HTTPS behaviour, load test of the reset route, real email delivery.
