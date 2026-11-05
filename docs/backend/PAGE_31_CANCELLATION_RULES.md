# Page 31 — Cancellation rules

Built as a **request**, not a cancellation. Code: `requestOrderCancellation` (`src/lib/orders/service.ts`), `validateCancellation` (`orderRules.ts`), route `POST /api/buyer/orders/{reference}/cancellation-requests`, `CancelRequestDialog`.

| Rule | Behaviour |
|---|---|
| Who | The owning buyer (session). Foreign or unknown reference: 404 and nothing changes. |
| When | Only PENDING_CONFIRMATION, CONFIRMED, PROCESSING, READY_TO_DISPATCH (before dispatch; payment and shipment state do not exist to check). Dispatched, in transit, out for delivery, delivered, on hold, already requested, cancelled, return requested, returned: 409 with a specific message. |
| Input | `reason` 10 to 500 characters, no `<` or `>`; `confirm: true`; unknown fields refused. |
| Effect | One conditional update on the exact status: status → CANCELLATION_REQUESTED, `cancellationRequest {at, reason, previousStatus}`, an event (actor buyer). A repeat or a race finds nothing to change (five simultaneous requests: one 201, four 409, one event). |
| What it does NOT do | It does not cancel the order, delete anything, refund anything or notify the supplier (no supplier workflow, payment or notification module). The answer and the dialog say so: `supplierNotified:false`, "not cancelled yet", "nothing is refunded". |
| Decision | BLOCKED: approving or rejecting a request belongs to the supplier side, which does not exist. The order stays CANCELLATION_REQUESTED (counted as an active issue) until then. |

Tests: F-01 to F-09, H-10 to H-12, H-17, unit C-01 and C-02.
