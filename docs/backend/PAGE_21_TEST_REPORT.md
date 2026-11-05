# Page 21 test report

2026-11-03, production build on port 3100, throwaway database `finbynmart_test`, Chrome via puppeteer-core.

| Suite | Result |
|---|---|
| `15-buyer-registration-test.mjs` MODE=mail (stand-in email provider): Page 19 (M, F, G), Page 20 (H), **Page 21 (P21-01 to P21-36)** | **160/160** |
| Same file MODE=nomail | 113/113 |
| `backend-pages-1-4`, `backend-pages-1-4-ui`, `site-functional-regression`, `13-contact-inquiry` | 63/63, 21/21, 37/37, 240/240 |
| `tsc --noEmit`, ESLint on touched paths, production build | passed |

Coverage by PRD section 20: success proof (P21-01..07), reset integration and no duplicate update (P21-06, P21-12, P21-25), account type (P21-10, 11, 16, 17, 19), session state (P21-18, 26), routes (P21-28, 32), security (P21-04, 09, 13..15, 20, 21, 34), frontend (P21-22..32), responsive at 16 widths with overflow, in-viewport, overlap and 44 px targets (P21-35, P21-36), and the journey Page 19 → 20 → 21 → sign-in with the old password refused and the new one accepted (P21-22..30).

**Latency:** the whole page response with a valid confirmation, 12 loads: median 47 ms, p95 55 ms. The server's own line for the page shows one database operation (the event lookup, about 29 ms to Atlas) and about 30 ms in total.

Screenshots: `docs/page-reports/screenshots/21-password-reset-success-{desktop-1440,tablet-820,mobile-390}.png`.

Not run: Lighthouse, a contrast tool, screen readers, Firefox/Safari, landscape, zoom 80-200%, a simulated database failure (UNAVAILABLE state), HTTPS.
