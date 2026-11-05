# Page 27 — Cancellation rules

Reused unchanged by Page 28. Service: `cancelBuyerInquiry(buyerId, idOrReference)` in `src/lib/inquiries/service.ts`; route `PATCH /api/buyer/inquiries/[id]/cancel` (reference or id).

## Who and when
- Only the owner (the query names the buyer from the session) and only while the status is **NEW, NOTIFIED or IN_PROGRESS** (and the old lowercase `new`). A replied, quoted, closed, cancelled or rejected inquiry cannot be cancelled (409): once a supplier has replied or the inquiry is final there is nothing for the buyer to withdraw.
- No "order or selection exists" rule is needed: no orders, selections or quotations exist. Add one when they do.

## What happens
1. `findOneAndUpdate` with the status condition in the filter (so two simultaneous cancels cannot both win): status becomes CANCELLED, `cancelledAt` and `updatedAt` are set.
2. One entry is appended to `statusHistory`: `{ from: previous status, to: "CANCELLED", actor: "buyer", at, reason: "Cancelled by the buyer" }`.
3. The record, its reference, message and earlier history are kept. Nothing is deleted; there are no quotations, responses or messages to preserve or remove.
4. The answer is the updated inquiry; the page then shows Cancelled, the summary cards and the sidebar badge are read again, and a success toast is shown only after this answer.

## Failures
Another buyer's, unknown, malformed and guest inquiries: 404 (identical). Not cancellable: 409 with the current status in the message. Repeated cancel: 409, history unchanged. Rate limit: 30 per 10 minutes per buyer (429). No route sets a status directly (PATCH on the inquiry itself is 405).

## Interface
List: "Cancel Inquiry" in the row menu (or "Cancel" on a card) only when `canCancel`; details page: More Actions and the bottom bar, only when `canCancel`. Both open the same alert dialog: it names the inquiry and supplier, says it stays in the list as Cancelled with its history, says it cannot be undone, focuses "Keep inquiry", closes on Escape, and locks while the request runs. No notification is sent to the supplier (none exists); the dialog does not claim one.
