# Page 31 — Export rules

Built: `POST /api/buyer/orders/export` → CSV (`exportBuyerOrdersCsv`).

- **Scope:** only the signed-in buyer's own orders, under the same validated filters as the list (status, supplier, currency, date window, search, sort). `page` and `limit` are ignored for a file.
- **Bound:** at most 5,000 rows (newest first by default); `X-Export-Truncated: true` and the toast say when the cap cut the file short ("narrow the filters for the rest").
- **Content:** order reference, placed on (India time), supplier, items with quantity and unit, currency, order amount as a plain decimal in major units, status, expected delivery with its source, quotation reference. No payment, address, contact, internal-note or id field exists in the file.
- **Safety:** cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading apostrophe so a spreadsheet cannot run them as formulas; quotes and commas are escaped (tests G-04, unit E-01).
- **Delivery:** generated and sent in the one response (attachment, private no-store, nosniff). The browser downloads it only after a 200; the success toast is shown only after that. Nothing is stored, so there is no shareable link and nothing to expire.
- **Audit:** each export writes a `security_events` row (`orders_exported`, row count, truncated flag, filter names only, no values). Rate limit: 10 per 10 minutes.
- **Not built:** PDF export, and background generation of very large exports (the cap makes it unnecessary today). Export is disabled in the UI when there is nothing to export.
