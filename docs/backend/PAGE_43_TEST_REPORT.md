# Page 43 — test report (everything below was actually run, 2026-11-12)

Environment: production build in `.next-audit`; **two** servers from the same build on the throwaway database `finbynmart_test` (dropped afterwards): :3100 with `QUOTATION_TAX_RULES` set to the TEST fixture (`TEST-NOT-APPLICABLE`, `TEST-RATE-18`: test data only, not production rules) and :3101 with it unset (to prove submission is BLOCKED when nothing is configured); Chrome headless, `puppeteer-core`.

| Suite | Result |
|---|---|
| `43-quote-rules-unit-test.mjs` (exact decimals, fixtures, rounding, validation, normaliser) | **50 / 50** |
| `43-supplier-create-quotation-test.mjs` (integration + concurrency + security + browser + scale) | **122 / 122** |
| Regression `42-supplier-quotations-test.mjs`, `39-supplier-dashboard-test.mjs`, `29-30-buyer-quotations-test.mjs`, `30-quotation-rules-unit-test.mjs` | see the Page 44 report (re-run on the final build) |
| `npx tsc --noEmit`, `next lint`, `next build` | pass |

## What the 122 cover
A access (401 / 403 / suspended / redirects / cross-site) · B the quotable-inquiry picker, context and product search (privacy, pagination bounds, identical 404s) · C draft creation (server-derived ownership, forged fields ignored, duplicate returns the same draft, closed / guest refused, invalid values 422, 413 / 400, product ownership, draft invisible to the buyer, Page 42 shows it) · D revision-guarded saves (stale 409, simultaneous saves: one wins, forged fields) · E preview (writes nothing, tax pending state, blocking reasons, **browser / server calculation parity on six inputs**) · F submission validation on the no-tax server (BLOCKED) and the tax server (wrong total, changed tax version, stale revision, incomplete, expired validity, closed inquiry) · G the real submission (snapshot, money fields, inquiry `NEW > IN_PROGRESS > QUOTED`, one outbox row and one notice, buyer visibility, immutability, replay, changed-body conflict, audit) · H concurrency (double click ×6, different keys ×5, 30 simultaneous creates with unique references, 3 simultaneous creates for one inquiry) · I rollback of a failed submission and recovery of an undelivered notice, buyer opt-out · J pages (404s, redirects, no PDF / upload routes) · K the full browser journey (picker → form → error summary with focus → live summary → network failure and retry → reload → conflict panel → preview modal → review → submit → detail page; changed-total handling) · L responsive (16 widths, mobile summary toggle, sticky action bar, tap targets, keyboard order, labels) · M scale and query plans.

## Findings during testing (all fixed)
Partial first save lost defaults; Page 42's list projection hid `draft.complete`; wrong message with no tax configured; same-key requests arriving after the first commit got 409 instead of a replay; **the write routes (here and in Page 42's withdraw / export) used the read limiter**; picker index lacked `_id`; and several test-harness errors (a fixed sleep, a document-bottom measurement, shared rate limits, a mangled reference generator). The final run's only change from the previous one was the measurement fix for L-03.

## Not run / not covered
Firefox, Safari, real devices, landscape orientation, browser zoom 80–200 %, screen reader, Lighthouse, a measured contrast ratio; staff roles and membership expiry (not built); attachments, PDF, e-mail, scheduled outbox processing (BLOCKED); a load test. The filter "drawer" of Page 42 is an inline panel.
Screenshots: `docs/page-reports/screenshots/43-create-quotation-{picker-1440,form-1440,review-1440,tablet-820,mobile-390}.png`.
