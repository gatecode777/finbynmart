# Page 31 — Payment status rules

Status: **BLOCKED.** There is no payment module: no `payments` collection, gateway integration, webhook route, transaction references, partial payments or refund records (audit: `PAGE_31_BUYER_ORDERS_AUDIT.md`).

What the product does instead: the page shows a "Payment Overview: not available yet" box and **no amount**: no zero, no estimate, no figure copied from the reference image. The orders list has no payment column and no payment filter ("display only supported states"). `GET /api/buyer/orders/summary` reports `capabilities.payments = false` and returns no payment or refund number.

Rules for whoever builds the module (from the PRD, to be kept):
- Payment status is separate from order status; states PENDING, PROCESSING, PARTIALLY_PAID, PAID, FAILED, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED.
- Only verified gateway webhooks, an authorised payment service or approved manual reconciliation may change it. A frontend redirect to a success page is not evidence of payment. A buyer can never mark an order paid.
- Paid amount = confirmed successful payments only (no failed, pending, cancelled, unverified or duplicate events); pending amount follows the order's payment terms; refunds only from genuine refund records.
- Never combine currencies without an approved conversion service; use integer minor units.
