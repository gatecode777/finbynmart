# Chart aggregation

One MongoDB aggregation answers the KPI counts, the trend and the category inputs together:

1. `$match { buyerId, createdAt in [previousStart, end) }` first, so it uses the `{buyerId, createdAt}` index (verified: IXSCAN, no COLLSCAN, M-03).
2. `$facet`: (a) `counts`: `$group` by current or previous window; (b) `trend`: current window only, `$group` by `$dateTrunc { unit: day|week|month, timezone: "Asia/Kolkata", startOfWeek: "monday" }`; (c) `products`: current window only, `$group` by `productKey`, sorted, limited to 300 groups.
3. The server fills empty buckets (zero is a real value inside the defined range) and maps product keys to categories in memory.

The browser receives only the aggregate series (a few hundred bytes to 2 KB), never inquiry documents. The chart is hand-drawn SVG (no chart library added): a role=img summary, a hidden data table for screen readers, a legend that says orders are not available.

Limits: the `products` facet is capped at 300 distinct products per period (a buyer with more would see the 300 most inquired). The 365-day range at 20,000 inquiries fetches documents for the product group (about 170 ms aggregation); an index including `productKey` would make it covered if ranges that long become common.
