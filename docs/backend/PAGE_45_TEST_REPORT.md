# Page 45 — test report (everything below was actually run, 2026-11-12)

Environment: production build in `.next-audit`, served on :3100 with `MONGODB_DB=finbynmart_test` (throwaway database; cleaned and dropped afterwards), Chrome headless 1440 default, `puppeteer-core`.

| Suite | Result |
|---|---|
| `docs/page-reports/tools/45-supplier-order-rules-unit-test.mjs` | **39 / 39** passed (status partitioning, counts, queries, CSV safety) |
| `docs/page-reports/tools/45-supplier-orders-test.mjs` | **103 / 103** passed (security, tenant isolation, search, filters, pagination, E2E browser, scale) |
| `npx tsc --noEmit` | pass (0 errors) |
| `next lint` | pass (0 warnings or errors) |
| Production build (`npm run build`) | pass |

## Groups in the 103 checks

- **Group A (Access & Role Boundaries)**: 401 on unauthenticated list/summary/detail/export; 403 JSON for signed-in buyers; 403 for suspended companies; browser redirects unauthenticated visitors to sign-in and buyers to `/forbidden?portal=supplier`; cross-site POSTs blocked; empty-state verified for companies without linked sellers.
- **Group B (Data Projection & Privacy)**: Supplier A sees only their own 18 orders with strict tenant isolation; row projection strips private buyer IDs, email, phone, and events; buyer displayed by business entity name only; lifecycle status, fulfilment label, and payment status ("Payment status unavailable") properly distinguished; multi-currency preservation without invalid cross-currency summing; stable pagination across 4 pages.
- **Group C (Status Groups, Search & Filters)**: Status group partitioning verified across Awaiting, In Progress, Ready to Dispatch, Dispatched, Delivered, Cancelled, and Attention; literal regex-escaped search matches order reference prefixes, quotation references, inquiry references, and product names; counts update dynamically with search; amount sorting requires single currency; custom date ranges enforce two valid dates.
- **Group D (Order Detail View)**: Detail endpoint returns items, status, business name, and payment unavailable; recorded buyer cancellation reason presented as plain text; cross-record link scoping prevents foreign supplier reference leaks; uniform 404 responses for foreign or non-existent order references.
- **Group E (Lifecycle Actions / Non-Availability)**: Verifies that mutation actions (Confirm, Cancel, Update Fulfilment, Mark Paid) are honestly absent and their non-availability explained.
- **Group F (Export)**: Synchronous CSV export with current filters, formula escaping, max 5,000 row cap, and audit event logging in `security_events`.
- **Group G (Browser UI)**: Metrics strip, status chips, debounced search (300 ms), filter drawer integration, clear filters, detail navigation with state preservation, and API error retry state.
- **Group H (Mobile Responsive & Accessibility)**: Stacked order cards replacing the data table below 900px; 0 horizontal page overflows; all interactive touch targets ≥ 40 px; accessible filter modal drawer with focus trapping; keyboard Tab order and visible focus rings.
- **Group I (Visuals & Motion)**: 16 responsive breakpoints verified from 320px to 2560px on both list and detail views; zero animations under `prefers-reduced-motion`.
- **Group J (Scale with 10,000 Orders)**: Seeded 10,000 orders; verified query plans with 0 collection scans (`COLLSCAN=false`) and 0 blocking sorts (`SORT=false`); tested latency on list, search, deep offset (page 500), amount sort, and summary.

## Not run / not covered

Firefox and Safari/WebKit (Chrome headless and emulation used); real physical devices; landscape mobile testing; browser zoom at 150-200% (emulated via viewport width adjustments); online payment gateway integration (BLOCKED, no provider); shipping/tracking carrier webhooks (BLOCKED, no module).

