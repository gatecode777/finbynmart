# Dashboard API

## GET /api/buyer/dashboard

Query: `range` = `7d | 30d | 90d | this-month | previous-month | custom` (default `30d`), and for `custom` `startDate` and `endDate` as `YYYY-MM-DD`. Any other parameter, including `buyerId`, is ignored.

Access: 401 without a session (or a suspended account, or a revoked session), 403 for a non-buyer. 120 requests a minute per buyer (block-reserved limiter). `Cache-Control: private, no-store`.

400 for an invalid range (`{ ok: false, message, fields: { range } }`): unknown preset, impossible or malformed date, start after end, end in the future, more than 366 days, incomplete custom range.

Success `{ ok: true, data }`, where `data` has `period`, one object per section and `meta`. Each section is `{ status: "ok", data }` or `{ status: "error", message }`, so one failing query does not blank the rest.

- `period`: `key, label, startDate, endDate` (both inclusive, India time), `days, bucket, timezone`.
- `statistics`: `totalInquiries { value, previous, changePercent|null }`; `quotationsReceived`, `ordersPlaced`, `totalOrderValue` each `{ available: false, reason }`.
- `trends`: `bucket`, `inquiries [{ start (ISO), count }]` (one entry per day, week or month of the range; zero where nothing happened), `orders { available: false, reason }`.
- `topInquiryCategories`: `{ total, items [{ name, count, percent }] }` (top four plus "Others").
- `recentInquiries`: five of `{ id, reference, title, supplierName, createdAt, quantity, unit, status, statusLabel, href }`. No message text.
- `recentQuotations`: `{ available: false, reason }`.
- `accountStatus`: `name, companyName, accountStatus, emailVerified, phoneVerified, businessVerification { available: false, reason }`.
- `activity`: `activeInquiries`, `pendingQuotations` and `openOrders` not available.
- `saved`: `savedProducts`, `savedSuppliers`, `cart` and `notifications` not available.
- `recommendedSuppliers`: `{ personalized, basis, suppliers [{ name, slug, city, state, url }] }`.
- `meta`: `generatedAt`, `timezone`, `timingsMs` per section (`inquiryAggregation`, `recentInquiries`, `activity`, `accountStatus`, `savedCounts`, `recommendations`, `total`).

One endpoint serves everything; the page calls the same service function directly on the server.
