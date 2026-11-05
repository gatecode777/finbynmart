# Page 28 — Quotation selection, revision requests and orders

**BLOCKED: nothing to select.** With no quotations, no order module and no checkout, the page offers **no** Select & Proceed, Request Revision or Compare control, creates no order record, no decision event and no payment. The Quotations tab explains why. Cancel Inquiry is the only decision action on the page.

## Contract for when quotations and orders exist
**Select & Proceed**
1. Resolve the inquiry by `{ reference, buyerId }`; resolve the quotation by `{ _id, inquiryId }`; it must be SENT, not expired, not rejected or withdrawn.
2. Confirm in the shared alert dialog with the supplier, amount, currency and validity.
3. In one transaction: mark the quotation ACCEPTED, append an auditable `statusHistory` event (actor "buyer"), and refuse a second accepted quotation for the same inquiry (a partial unique index on `{inquiryId, accepted:true}`), so simultaneous selections give one winner and a 409.
4. Create the order only through the order module's own entry point (it snapshots the address with `toAddressSnapshot`), then redirect to its route. Selection never charges, marks anything paid or closes the inquiry by itself.
5. If orders do not exist at that time: do not store a fake order; show "Order processing is not available yet".

**Request Revision**: allowed only for a SENT, unexpired quotation of the buyer's own inquiry; reason from a fixed list plus a bounded message; stored as a separate auditable event; the supplier is notified through the real notification workflow; the quotation itself is never edited.

Flip `capabilities.quotationSelection` and `revisionRequests` only with these in place and tested (concurrent selection, wrong inquiry, expired, wrong buyer, duplicate submit, order flow available and unavailable).
