# Page 24 — Address test report

Run on 2026-11-03 against a production build on the throwaway database `finbynmart_test` (dropped at the end of the batch). Chrome headless via puppeteer-core. No email provider configured (not needed here).

| Suite | Result |
|---|---|
| `docs/page-reports/tools/24-address-rules-unit-test.mjs` | 24 passed, 0 failed |
| `docs/page-reports/tools/24-buyer-addresses-test.mjs` (API + browser) | **85/85 passed** (run twice after the final code change: the second run after the list-ordering change and rebuild) |
| `docs/page-reports/tools/24-address-explain.mjs` | no COLLSCAN, no sort stage (see performance report) |
| Page 22 dashboard suite after the sidebar change (Address Book now a link, 6 "Soon" items) | 94/94 |
| `npx tsc --noEmit`, `npx eslint` on the changed files, production build | passed |

## Coverage of the 85 checks
Access (A): 401 on every route, supplier 403, suspended 401, sign-in redirect with return path, partial unique indexes present · Create (B): valid, normalised phone, version, company absent, server-set fields, 11 invalid-field cases, UK postal code, operator objects, mass assignment, audit without content · List (C): statistics (unique counting), defaults first, filters, six search fields, regex characters literal, combined filters, invalid query values, pagination, `buyerId` query ignored, buyer isolation · Update (D): owner read, IDOR/bad ids identical 404, version bump, stale 409, cross-buyer 404, simultaneous saves 200+409, purpose removal clears default, partial body refused · Defaults (E): replace in one step, independence, one address both defaults, `PURPOSE_MISSING`, bad ids, cross-buyer, **5 parallel set-default and 4 parallel creates leave exactly one default**, audit · Delete (F): cross-buyer 404, default clearing named, gone afterwards, inquiry unaffected, audit without content · Company/limits (G): `NO_COMPANY`, own-company link, foreign `companyId` refused, 50-address cap, 61st write 429 · Browser (H, 21 checks): empty state, active sidebar item, dialog semantics and focus, validation, PIN rule, create, focus return, second address, set default, filter/URL/search/clear, edit, Escape with unsaved changes asks (native confirm declined, dialog stays), delete confirm + cancel + confirm, URL restore, invalid URL fallback · Inquiry integration (I): chooser lists the buyer's own delivery addresses, fills "City, State PIN", absent for guests · Responsive (J): 16 widths 320–2560 without overflow or overlapping card buttons (the filter chips are a deliberate horizontal scroller and are judged by their container), dialog fits 320px, no touch target under 32px · Performance (K).

## Corrections made while testing
Two expectations in the test itself were wrong (delivery count is 3, not 4; a validation error hid the intended check) and were fixed in the test, not the product. One product change came from the explain check (list ordering, above). The write-time target in the suite follows CLAUDE.md (500 ms), not a stricter number.

## Not run
Lighthouse, a contrast tool (colours reuse existing tokens only), Firefox, Safari, real devices, landscape orientation, browser zoom 80–200%, screen-reader testing, concurrent multi-buyer load, tests against a hosted/staging environment. Screenshots: `docs/page-reports/screenshots/24-buyer-addresses-{desktop-1440,tablet-820,mobile-390}.png`.
