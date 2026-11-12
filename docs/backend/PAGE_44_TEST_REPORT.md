# Page 44 — test report (everything below was actually run, 2026-11-12)

Environment: production build in `.next-audit`, served on :3100 with `MONGODB_DB=finbynmart_test` (throwaway database; cleaned and dropped afterwards), Chrome headless 1440 default, `puppeteer-core`. Tested with `--import ./docs/page-reports/tools/alias-register.mjs`.

| Suite | Result |
|---|---|
| `docs/page-reports/tools/44-quotation-versions-unit-test.mjs` | **29 / 29** passed |
| `docs/page-reports/tools/44-supplier-quotation-versions-test.mjs` | **94 / 94** passed |
| `npx tsc --noEmit` | pass (0 errors) |
| `next lint` | pass (0 warnings or errors) |
| Production build (`npm run build`) | pass |

## Groups in the 94 checks

- **Group A (Access & Security)**: Unauthenticated requests answer 401; buyer role receives 403 JSON; suspended supplier company receives 403; browser redirects unauthenticated visitors to sign-in and buyers to `/forbidden?portal=supplier`; cross-site POSTs to revision/withdraw are rejected (403).
- **Group B (Version Viewing & Pointer Semantics)**: Default view shows current submitted version; historical versions carry clear indicators, banner, and disable mutations; malformed/negative/fractional version numbers reject with 400; foreign supplier quotations reject with identical 404; buyer privacy enforced (business name only, no private emails/phones); legacy records with incomplete calculations display honest integrity notes; catalog product changes do not overwrite stored quotation snapshots; accepted/withdrawn/rejected statuses display immutable flags.
- **Group C (Version Listing & Cursor Pagination)**: Version summaries return 20 per page newest first; lightweight DTO (no bulky specifications or private inputs); bounded pagination limits (max 50, bad cursor refused); tenant isolation verified across suppliers.
- **Group D (Version Comparison)**: Differences detected across unit price, terms, validity, freight, notes; comparisons do not mutate underlying documents; identical versions report `identical: true`; cross-currency comparisons reject numeric deltas; stable line item ID tracking.
- **Group E (Revision Workflow)**: Creation of draft revisions via POST; idempotency enforcement on revision submission; duplicate revisions prohibited (409 REVISION_EXISTS); buyer remains unaware of drafts until explicit submission.
- **Group F (Edge Cases & Concurrency)**: Simultaneous revision creation race tested (5 concurrent calls: exactly 1 draft created, 4 receive 409); double-click protection; closed inquiries reject revisions.
- **Group H (Server-rendered Pages)**: Status markers, disclosures, noindex meta tags on private supplier views.
- **Group I (Browser E2E & Responsive)**: Full interactive revision flow in headless browser; version navigation via history; compare view expansion; zero console errors; 16 responsive breakpoints verified from 320px to 2560px without horizontal overflow; stacked compare cards on mobile viewports (< 768px).
- **Group L (Scale & Query Plans)**: Performance verified on 45-version lineage; index scan coverage (`COLLSCAN=false`, `SORT=false`); payload sizes bounded (< 12 KB).

## Not run / not covered

Firefox and Safari/WebKit (Chrome headless and emulation used); real physical devices; landscape mobile testing; browser zoom at 150-200% (emulated via viewport width adjustments); PDF export (BLOCKED, Print fallback); automated customer email notification delivery (BLOCKED, outbox pattern verified).

