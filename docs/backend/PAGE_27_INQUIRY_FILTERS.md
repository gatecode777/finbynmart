# Page 27 — Filters, search, sort and paging

Every filter is enforced on the server; the browser never filters rows. All filters start from the buyer's own documents (`buyerId` from the session), so each is bounded by that buyer's history.

| Control | Parameter | How it is applied |
|---|---|---|
| Status tab | `status` | `status $in` the stored values of the group (see the status mapping). Tab counts are counted under all the other filters, so a tab shows what it would return. |
| Search | `q` | Trimmed, collapsed, control characters removed, ≤60 characters; `$or` of: reference **prefix** (case-insensitive), product name contains, supplier name contains. The text is regex-escaped, so `.*` or `(` are matched literally. Requirement title and message are not searched (no title exists; the message is private). |
| Inquiry type | `inquiryType` | `inquiryType = X`, or for records from before the field existed the old `type` (quote = Get Best Quote; inquiry with a product = Product Inquiry; without = General Inquiry). Bulk Requirement has no old equivalent. |
| Supplier | `supplierId` | `supplierKey` equality; the choices are the suppliers that really appear in the buyer's inquiries (grouped, at most 100). |
| Product category | `categoryId` | `categoryKey` equality (saved when the inquiry was sent). Inquiries without a product have none and appear under no category; the choice list is empty when no inquiry has one. |
| Date range | `range` / `dateFrom` + `dateTo` | `createdAt` in `[start, end)` using the dashboard's India-time rules (presets include today; custom is inclusive of both days, end not in the future, at most 366 days). 23:59:59.999 IST belongs to that day; 00:00:00.000 IST to the next (tested). |
| Sort | `sort` | newest `(createdAt desc, _id desc)`, oldest `(createdAt asc, _id asc)`, updated `(updatedAt desc, _id desc)`. `_id` is the tie-breaker, so two inquiries created in the same millisecond keep a fixed order on every page. "Inquiry Reference" is not offered: references are random, so their alphabetical order means nothing. |
| Paging | `page`, `limit` | skip/limit; default 20, max 50, page ≤ 1000. |

## Interface behaviour
- Several filters combine; the Filters button shows how many are active; chips remove one; "Clear all filters" removes all of them; Apply sends them, and any change returns to page 1.
- Search is debounced 300 ms; answers overtaken by a newer request are ignored.
- The address holds every choice (`?status=closed&q=sunrise&...`); an invalid value in the address falls back to the defaults on the page (the API itself answers 400).
- Records without `updatedAt` (old ones) sort last under "Recently Updated" and show their last status change or submission time as "Last Updated".
