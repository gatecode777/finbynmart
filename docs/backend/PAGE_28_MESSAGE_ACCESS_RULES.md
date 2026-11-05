# Page 28 — Message access rules

**BLOCKED: there is no buyer-supplier messaging** (no model, API, realtime channel or supplier inbox). The Messages tab says "Messaging is not available yet" and points to the buyer's original message in Requirement Details. No history, composer, attachment control or unread marker is shown, and Page 28 does not build a chat of its own.

## Contract for when messaging exists (the page only consumes it)
- A message belongs to one inquiry (`inquiryId`) and has `senderRole` (buyer or supplier), `senderId` from the session, `body` (plain text, length limit), `createdAt`, read state per participant.
- Read and send authorise through the buyer's own inquiry first; the supplier must be that inquiry's recipient. A message id alone never grants access; a message from another inquiry is a 404.
- Rate limits per buyer and per inquiry; paged history (newest first, page size ≤ 50); no phone or e-mail revealed unless the product explicitly allows it.
- Attachments follow `PAGE_28_ATTACHMENT_SECURITY.md`; realtime channels join only after the same ownership check.
- Message text must never be logged or sent to analytics.
