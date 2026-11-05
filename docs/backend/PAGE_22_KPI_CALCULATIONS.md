# KPI calculation rules

Code: `src/lib/buyer/dashboard.ts`, `src/lib/buyer/dateRange.ts` (29 unit tests: `22-date-range-unit-test.mjs`).

**Time policy.** Every day boundary is India time (Asia/Kolkata, UTC+05:30, no daylight saving). A period is `[start, end)`: start is midnight IST of the first day, end is midnight IST after the last day. Presets end today, inclusive: 7d, 30d, 90d, this-month (the 1st to today), previous-month (the whole previous month). Custom: both dates inclusive, start not after end, end not in the future, at most 366 days. The same window feeds the KPI, the chart and the categories.

**Comparison period.** The window of the same length immediately before the start. `changePercent = (current - previous) / previous`, one decimal; **null when the previous period is empty** (no invented percentage). The page then says "No inquiries in the previous N days to compare with".

**Total inquiries.** Count of the buyer's inquiries whose `createdAt` is in the period, whatever status they later reached (cancelled and rejected included: it is the number the buyer submitted). Guest inquiries (no `buyerId`) are never counted for anyone. Legacy `new` counts like `NEW`.

**Active inquiries** (activity panel and sidebar badge): status NEW, `new`, NOTIFIED or IN_PROGRESS now, not date bound. **Recent inquiries:** the latest five overall, not date bound.

**Quotations received, orders placed, order value, pending quotations, open orders:** no source module exists, so each is `{ available: false, reason }` and the page prints "Not available yet". They are never zero, and quotation amounts are never shown as order value. When an order module exists: count eligible orders in the period, sum value per currency (never across currencies without an approved conversion), exclude cancelled and rejected.

**Categories.** The category of the product named by the inquiry (catalogue product category, or the sample product's category); no product means "General inquiries"; an unknown product means "Other". One inquiry names at most one product, so nothing is counted twice. Percent is of the period total; the top four by count (ties by name) are shown and the rest are grouped as "Others".

**Trend.** One bucket per day (up to 31 days), week starting Monday (up to 140 days) or month; computed by MongoDB (`$dateTrunc`, timezone Asia/Kolkata); buckets with no inquiries are real zeros inside the defined range. Orders are not drawn (no data).

Verified by `22-buyer-dashboard-test.mjs` C, D and E (exact counts at the 00:00:00.000 and 23:59:59.999 IST boundaries, week and month buckets, previous-period zero).
