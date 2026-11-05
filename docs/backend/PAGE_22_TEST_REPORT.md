# Page 22 test report

2026-11-03: production build, port 3100, throwaway database `finbynmart_test`, Chrome via puppeteer-core. Only what ran is listed.

| Suite | Result |
|---|---|
| `22-date-range-unit-test.mjs` (India-time ranges, boundaries, buckets, validation, percentages) | **29/29** |
| `22-buyer-dashboard-test.mjs`: A access (8), B isolation (10), C KPIs (12), D ranges (4), E trend (7), F categories (4), G recent inquiries (7), H account status (3), I suppliers (5), J partial/size (2), K browser (about 25), L responsive (3, with 16 widths), M performance (4) | **94/94** |
| `tsc --noEmit`, ESLint on touched paths, production build | passed |

Responsive: no horizontal overflow, clipped card or overflowing top bar at 320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920 and 2560 px; touch targets of at least 32 px at 390 px outside tables; the inquiry table becomes one card per inquiry on phones. Screenshots: `docs/page-reports/screenshots/22-buyer-dashboard-{desktop-1440,tablet-820,mobile-390}.png`. Layout changes made after those screenshots (KPI cards in a row, wide-screen table placement, date column) were checked in the build but the screenshots were not retaken.

Not run: Lighthouse, a contrast tool, screen readers, Firefox/Safari, landscape, zoom 80-200%, a forced failure of one section (the per-section error path is exercised only by code review), quotation/order/cart/notification tests (no such modules: blocked), large quotation or order histories.
