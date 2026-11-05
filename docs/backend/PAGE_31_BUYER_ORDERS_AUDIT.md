# Page 31 — Buyer Orders: pre-build audit

Audit date 2026-11-04, before any Page 31 code. Method: search of `src/`, `docs/` and the MongoDB collection list for orders, payments, shipments, invoices, returns and refunds. Nothing was assumed from Page 32's PRD or the earlier architecture audit.

## What existed

| Area | Finding |
|---|---|
| Order collection, model, service, routes, pages | **None.** The sidebar "Orders" item was a non-link marked "Soon". |
| Quotation → order | **No link.** Accepting a quotation records the decision only (`docs/backend/PAGE_30_QUOTATION_DECISION_RULES.md`); nothing creates an order, and the PRD forbids silent conversion. |
| Order creation flow | **None** (no checkout, no supplier workflow, no supplier accounts that can act). |
| Payments (records, gateway, webhooks, refunds) | **None.** No `payments` collection, no gateway, no webhook route. |
| Shipments / tracking / courier | **None.** |
| Invoices (model, numbering, PDF, private storage) | **None.** Private document storage exists only for the buyer's own profile documents. |
| Cancellation / returns / refunds | **None** for orders. (Inquiry cancellation exists and is unrelated.) |
| Notifications | Buyer in-app notification centre exists; no supplier notification channel. |
| Reusable | Buyer auth and guards (`requireBuyerApi/Page`, `buyerGuard`), rate limiter, India-time date ranges, the My Inquiries list pattern (tabs, filters, URL state, stale-restore), shared Modal/Toast/shell, quotation money formatting, the `security_events` collection for an audit trail. |

## Decision

The PRD's own rule: *if the order, payment, shipment, invoice or return system is not implemented, mark its integration BLOCKED; never fabricate an order, payment, shipment event, invoice, cancellation approval or refund.* The owner's standing rule: build the backend with the page. Both are met by building the **buyer side** of a new `orders` collection (list, summary, details, cancellation request, CSV export) and leaving everything that needs another actor BLOCKED, exactly as was done for quotations. In real use every buyer sees "No Orders Yet" until a future module creates orders.

| Feature | Status | Why |
|---|---|---|
| Order list, five KPI cards, tabs with counts, search, filters (status, supplier, currency, date), six sorts, pagination | Built | New `orders` collection, buyer-scoped, indexed |
| Order details page | Built (compact stand-in for Page 32, whose PRD has not been sent) | The list's View Order link must not dead-end |
| Cancellation **request** | Built | Persists a request and an event; does not cancel, refund or notify the supplier |
| Export Orders (CSV) | Built | Real server-side file, buyer-scoped, capped, audited |
| Order **creation** | **BLOCKED** | No checkout / supplier workflow; `buildOrderDoc` is the single writer helper for it |
| Payment overview, payment status, paid / pending / refund amounts | **BLOCKED** | No payment records or gateway; the page shows "not available yet", never a zero |
| Invoice availability and download | **BLOCKED** | No invoice model or private store |
| Shipment tracking, carrier events, "delayed" | **BLOCKED** | No shipment module; the delivery column restates the order status only |
| Returns and refunds | **BLOCKED** | No return workflow or refund records |
| Supplier / admin order management, supplier notification of a request | **BLOCKED** | No supplier or admin workflow |
| Dashboard "orders" figures | Not changed | The Page 22 dashboard still says orders are not available; wiring it to this module is future work |

## Gaps found

No supplier or admin side can move an order forward, so statuses never change in real use. Addresses are not saved on orders (no order-time address snapshot exists), so the details page shows none. There is no persisted payment or refund state, so Payment Overview cannot be computed.
