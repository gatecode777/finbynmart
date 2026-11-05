# Page 23 test report

2026-11-03: production build, port 3100, throwaway database `finbynmart_test`, a private test document directory, Chrome via puppeteer-core. Only what ran is listed.

| Suite | Result |
|---|---|
| `23-profile-rules-unit-test.mjs` (validation, completion weights, postal rules, expiry) | **33/33** (it caught a real bug: a valid PIN was rejected because a regex lost its backslash) |
| `23-buyer-profile-test.mjs` MODE=full: A access (5), B personal (11), C company (14), D documents (19), E verification (8), F completion (3), G security (9), H limits (1), I browser (28), J responsive (2), K performance (2) | **102/102** |
| Same file MODE=nostorage (server without private storage) | **4/4** |
| Page 22 suite re-run after the shell changes | 90/90 (performance part skipped) |
| `tsc --noEmit`, ESLint on touched paths, production build | passed |

Responsive: no horizontal overflow and no control outside the viewport for Personal Details and Documents at 320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560 px, and for the other three tabs at 320, 390, 768, 1280, 1440; the tab row scrolls inside itself at 320 px. Screenshots: `docs/page-reports/screenshots/23-buyer-profile-{desktop-1440,tablet-820,mobile-390}.png`.

Findings fixed during testing: the change-password limiter counted validation mistakes (now only attempts that test the current password count); the Documents tab overflowed on phones (file input width); the Save button of a new company stayed disabled so the "choose a business type" message could not appear.

Not run: Lighthouse, a contrast tool, screen readers, Firefox/Safari, landscape, zoom 80-200%; virus scanning (none exists); the confirmation-email send path from this page (no provider; covered by the Page 19 suite); concurrent uploads; upload and view performance; large document histories; a hosted storage backend.
