# Page 41 — Supplier Inquiry Details & Response: audit (2026-11-12)

Verified in the repository before building. Route `/supplier/inquiries/[inquiryReference]` (tracker: new row, see below). Page 40 (the inquiries list) is BLOCKED and still not built, so this page is reached from the dashboard's recent inquiries, the Quotations list and detail, and the create-quotation page; its "back" link goes to the dashboard.

| PRD assumption | Repository fact | Decision |
|---|---|---|
| Inquiry assigned to supplier companies, recipient / assignment records | An inquiry is addressed to **exactly one seller** (`supplierKey`); a company owns sellers through `supplier_companies.sellerKeys` (platform-set) | Access = `supplierKey ∈ session company's sellerKeys`. There is no competing supplier on an inquiry, so "a response by Supplier A must not change Supplier B's state" cannot arise; it is enforced anyway by the query scope |
| Messages / conversation model | **None.** The buyer's inquiry page declared `messaging: false`, `supplierResponses: false` | One new bounded collection, `inquiry_messages` (type RESPONSE or CLARIFICATION: a clarification is a message type, not a second subsystem) |
| Supplier-specific response / read state | Only the shared inquiry lifecycle (`NEW … REPLIED, QUOTED …`) | No second state model: a message moves the inquiry through steps the lifecycle already allows (see data-model doc). **No read tracking exists → none is built, no "seen" is shown** |
| Buyer attachments | The inquiry form captures none | Not shown; the page says so once. **BLOCKED** (no data) |
| Response attachments / upload | No private storage a buyer can download from | **BLOCKED** (not offered) |
| Requested delivery date, target price | Not captured by the inquiry form | Not shown; the page says so once |
| Staff permissions | One login per company | New permission flag `respondToInquiries` (owner: true); suspended company = 403 |
| Buyer reply, live chat, delivery / read receipts | None | Not built. The page says a clarification's answer will not appear here; the buyer's page says replying is not available. No receipt is ever shown |
| Notification + outbox | Buyer in-app notifications (`notifyBuyer`) exist; my Page 43 outbox was quotation-specific | The outbox became the generic `notification_outbox` (renamed before any deployment); inquiry responses reuse it. No e-mail exists or is claimed |
| Idempotency, transactions | Added in Page 43 | Reused (`idempotency_keys`, `withTransaction`) |
| Related quotations, activity | `quotations` (events) and `statusHistory` exist | Read from the real records, bounded |

## What the buyer could not do before this page
The buyer's "Supplier Responses" tab said responses were not connected. It now reads the same `inquiry_messages` (buyer-scoped query, newest first, at most 20) and says replying from Finbyn Mart is not available. `REPLIES_CONNECTED` on the buyer list was switched on; two buyer-test expectations that encoded the old wording were updated. (One older buyer test, A-05, expected the pre-portal "Buyer accounts only" notice; the guard now redirects non-buyers to `/forbidden?portal=buyer`; the test was updated to the documented behaviour. That mismatch predates this page.)

## Defects found by testing and fixed
Rate limiter: write routes use the exact per-attempt limiter (the block-reservation limiter over-counts under concurrency); the message page index already had the stable `(createdAt, _id)` tie-break; the notice for a buyer who switched notices off is recorded as `SKIPPED_PREFERENCE` immediately instead of being queued and retried (the answer would otherwise have said "queued").
