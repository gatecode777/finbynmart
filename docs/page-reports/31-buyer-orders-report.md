# Page 31 report — Buyer Orders

Date: 2026-11-04. Routes: `/buyer/orders` and `/buyer/orders/[reference]` (a compact order page standing in for Page 32, whose PRD has not been sent). Spec: `docs/page-designs/31-buyer-orders.md`.

## What was found first

No order system existed: no collection, routes, pages, creation flow, payments, shipments, invoices, returns or refunds, and accepting a quotation intentionally creates no order. Audit: `docs/backend/PAGE_31_BUYER_ORDERS_AUDIT.md`. The PRD's rule was followed: build what has real backing, mark the rest BLOCKED, fabricate nothing.

## What was built

Backend: `src/lib/orders/` (`orderRules.ts` the single status lifecycle and parser; `service.ts` list, summary, facets, details, cancellation request, CSV export, and `buildOrderDoc` as the one helper for a future order writer); routes `GET /api/buyer/orders`, `/summary`, `/{reference}`, `POST /{reference}/cancellation-requests`, `POST /export`; new collection `orders` with 6 indexes; export audit rows in `security_events`.
Frontend: `src/components/buyer/orders/` (workspace, table/cards, filters dialog, cancellation dialog, status pill, order page view and actions), pages with an error boundary on the detail page, sidebar link (the last "Soon" item is now live).
Tests: `31-buyer-orders-test.mjs` 83/83, `31-order-rules-unit-test.mjs` 21/21; all earlier buyer suites still pass (`PAGE_31_TEST_REPORT.md`).

## Feature status

| Feature | Status |
|---|---|
| Order list, five cards, tabs with counts, search, filters (status, supplier, currency, date), six sorts, pagination, URL state | Implemented, tested (test-database orders) |
| Order page (items, agreed amount, supplier, activity, links to quotation and inquiry), print | Implemented, tested |
| Cancellation **request** (before dispatch; atomic; supplier not notified, nothing cancelled or refunded) | Implemented, tested incl. a race |
| Export Orders (CSV, buyer-scoped, capped, formula-safe, audited) | Implemented, tested |
| Order creation | **BLOCKED**: no checkout or supplier workflow |
| Payment overview and payment status | **BLOCKED**: no payment module (the page shows "not available yet", never a zero) |
| Invoice availability and download | **BLOCKED**: no invoice module |
| Shipment tracking, carrier events, "delayed" | **BLOCKED**: no shipment module (the delivery column restates the order status) |
| Returns and refunds | **BLOCKED**: no workflow or refund records |
| Supplier / admin order management, supplier notification | **BLOCKED** |
| Dashboard "orders" figures | Not wired (still "not available yet") |

## Deliberate differences from the reference image

The image shows paid / pending / refund amounts, invoice and payment columns, trend arrows, Track Shipment and Download Invoice. None of that is backed by data, so none is drawn: a Payment Overview box says it is not available yet, and the table has Order Status and Delivery columns instead.

## Performance (final run, remote cluster, indicative)

Up to 10,000 orders: list p95 118 ms, filtered and sorted lists p95 ≤ 111 ms, summary 94 ms, detail 87 ms, all under target; export of 5,000 rows p95 852 ms. Without a warm-up call two cold-first-request spikes were seen (359 ms and 302 ms), reported in `PAGE_31_PERFORMANCE_REPORT.md`.

## Honest summary

In real use every buyer sees "No Orders Yet", because nothing can create an order. The buyer side is verified only against orders inserted into the test database. Design and QA are not marked complete: no Firefox, Safari, device, zoom, landscape, screen-reader or Lighthouse runs, and the reference image was matched by screenshots only.

Not committed. Cleanup done: throwaway database dropped, test server on port 3100 stopped, `tsconfig.json` reverted.
