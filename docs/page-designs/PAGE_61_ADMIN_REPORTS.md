# Page 61 — Admin Reports

Route: `/admin/reports` · Portal: ADMIN · Tracker ID 61 · READ-ONLY operational counts. Out of scope and not built: revenue, GMV, payments, subscriptions, forecasts, funnels, supplier rankings, exports, scheduled mail, new tracking, a report builder (payments and subscriptions stay deferred).

## Files
`src/lib/admin/reportRules.ts` (client-safe: report definitions, date validation, zero-fill, chart bucketing), `reportService.ts` (the aggregations), `src/app/api/admin/reports/route.ts`, `src/app/admin/reports/page.tsx`, `src/components/admin/AdminReportsWorkspace.tsx`, `AdminReports.module.css`. Shared code touched: `permissions.ts` (5 capabilities), `guards.ts` (`requireAnyAdminPage` / `requireAnyAdminApi`: at least one of several capabilities), `AdminShell.tsx` (nav). Date logic reuses the supplier analytics rules (`analyticsRules.ts`: `parseRange`, `defaultRange`, IST day conversion). Tests: `87-admin-reports-unit-test.mjs` (15), `it-admin-reports.mjs` (integration, BLOCKED).

## Reports: counting unit, date field, source
| Report (capability) | Counting unit | Date placing it in a day | Source and rule |
|---|---|---|---|
| Buyer registrations (`reports.buyers`) | buyer accounts | `createdAt` | `users`, `role: "buyer"`, currently retained accounts created in the period; one per account |
| Supplier registrations (`reports.suppliers`) | supplier accounts (one account owns one company) | `createdAt` | `users`, `role: "supplier"`; NOT `supplier_companies.createdAt`, because the company record is created on first use of the supplier workspace |
| Requirements (`reports.requirements`) | submitted inquiries | `createdAt` | `inquiries`: `GENERAL_REQUIREMENT` = General; absent source or `DIRECT_INQUIRY` = Direct (the existing documented rule: an absent source is a direct inquiry); any other value = Unclassified. Matched deliveries, jobs, messages and the retired `requirements` collection are never counted |
| Quotations (`reports.quotations`) | quotation threads | `sentAt` of version 1 | `quotations`, `version: 1`, status not DRAFT. A draft's own `sentAt` is only a placeholder (verified in `quoteService.ts`); the real send time is written at submission. Revisions and revision drafts add nothing |
| Confirmed orders (`reports.orders`) | order confirmations | `placedAt` | `orders` (created only by the buyer's explicit confirmation); a later cancellation does not remove the event; quotation acceptance is never counted |
Labels in the UI repeat the unit and date basis, plus a definition and a limitation paragraph for every report.

## What the numbers are not
Buyer and supplier counts are accounts that exist today and were created in the period: there is no role-assignment history, no deleted-account record and no test or service-account marker, so none is excluded. Current status of records is deliberately not shown (it would not be a historical status). Nothing is reconstructed, and no report claims a historical total the data cannot support.

## Dates and timezone
Calendar days in Asia/Kolkata (UTC+05:30, no daylight saving). From and To are inclusive days; the interval is `[start of From, start of the day after To)`; the day grouping in the aggregation uses the same zone. Default: the last 30 calendar days including today. Validated: real dates, From not after To, not in the future, at most 366 days (366 accepted). The server converts the dates; the browser's timezone is never used. The chart is daily up to 62 days and weekly (Monday start) beyond, stated on the page; the breakdown is always daily and paginated 31 days at a time, with the summary covering the whole range.

## Consistency
Each report is ONE `$match` + `$group` aggregation; the summary is the sum of exactly those rows (zero-filled for every day), so summary, chart and breakdown agree. Across reports and between requests the numbers are approximate while writes continue (no snapshot read is claimed). A database failure is a 503 and is never shown as zeros.

## Permissions
Page and API need at least one reports capability; the requested report needs its own (a direct request for another report is 403); the UI offers only permitted reports; dashboard-only or other admins gain nothing. The payload is counts, labels and dates only: no name, e-mail, phone, message, quotation text or amount. Aggregate access grants no record detail.

## API
`GET /api/admin/reports?report=&from=&to=`: unknown report, bad, inverted, future or over-long dates and any other parameter are a 422 with `fields`; defaults apply when omitted; rate limit 120 per 10 min; `private, no-store` (no shared caching, so no cross-permission leakage); response: report, label, unit, date basis, definition, limitation, range (from, to, timezone, days, bucket), generatedAt, columns, summary, daily rows, warnings. GET only.

## Indexes and queries
`buyers_admin_newest (role, createdAt, _id)` (shared with Buyer Management), `admin_inquiries_newest (createdAt, _id)` (existing, Page 57) and two new narrow ones: `admin_reports_quotes_first (version, sentAt)` and `admin_reports_orders_placed (placedAt)`. Supplier accounts use the buyer index (`role` prefix). No per-day or per-row query, no whole-collection load. Performance and `explain` are unverified (no representative data).

## UI
Filters (report select of permitted types, From, To with `max` = today, Apply, Reset); inline range error on the inputs (`aria-invalid`, `role=alert`); results always labelled with their own report, range, timezone and generation time and marked "updating…" or "earlier request" while a newer one is pending; summary cards (Unclassified hidden at zero); an SVG bar chart with integer axis, thinned labels and a text alternative (the table); zero days listed; genuine zero stated as a real count; failure with Retry keeping the filters; 403 and 422 messages; URL state with `pushState` and Back/Forward restoring it. The design board's sample numbers and the unfilled-day omissions are not used.

## Verified
Passed: `tsc`; lint; production build; 15 unit checks (capability matrix, IST boundary conversion including one minute either side of midnight, validation incl. 366/367 days, future and impossible dates, leap day and year boundary zero-fill, weekly chart bucketing equals daily totals, counting-unit and read-only contracts, route and guard contracts); signed-out `GET` = 401 `private, no-store`, POST/PATCH/DELETE = 405, page redirect keeps the query. Mocked-API browser checks on a temporary fixture page (removed): 30 checks (populated labels, apply and URL, invalid and future and over-366 inline refusal, Reset, Back, weekly chart note and 31-day pages, failure with Retry keeping filters, stale response ignored and updating label, genuine zero, permitted types only, 403 message, GET only, 8 widths, landscape, 200 %-zoom width, keyboard focus). Screenshots `rp-1280.png`, `rp-390.png` in the session scratch folder (not individually reviewed).

## Blocked / not verified
`it-admin-reports.mjs` (boundary accounts at IST midnight, supplier counting, Direct/General/Unclassified reconciliation and fan-out, first-submission versus revision versus draft, cancelled orders, zero days, leap day, daily sum equals summary, no personal data in the payload, index use) is written and **not run**: no isolated database. Not run: signed-in checks, HTTP 403 by report, aggregation performance, Firefox, Safari, devices, screen reader, contrast tool. The mocked UI does not prove report accuracy.

## Gaps
Supplier registrations count accounts, not companies (see above). Records created by seeding or tests carry whatever timestamps they were given and are indistinguishable. No current-status breakdown is offered. Payments, subscriptions and financial reports remain deferred.
