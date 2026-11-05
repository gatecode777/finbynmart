# Page 28 — Supplier response rules

**BLOCKED: no supplier response exists.** There is no response model or collection, suppliers cannot sign in to anything that reads inquiries, and no inquiry can reach REPLIED through any code path. The Supplier Responses tab says: "Supplier replies are not connected yet ... nothing can appear here" and shows no card, no supplier name and no message. The summary shows "Responses Received: Not available yet" (never 0).

## Contract for when it is built
1. One `supplier_responses` record per reply, with `inquiryId` (or reference), `supplierKey`, `body` (plain text), `createdAt`, `status` (only PUBLISHED replies are readable by the buyer; drafts and internal notes never are) and an immutable edit history.
2. The buyer sees a response only through their own inquiry (`{ reference, buyerId }` first, then `inquiryId` of that inquiry); the supplier is taken from the inquiry's recipient, never from the request.
3. Creating a reply moves the inquiry to REPLIED through `canTransition` and appends `statusHistory` (actor "system" or "supplier"); the list cards, the status tabs and the timeline then follow without further changes.
4. An invited supplier with no reply is not shown as responding (today there is one supplier per inquiry).
5. Attachments on a reply use the private-file rules in `PAGE_28_ATTACHMENT_SECURITY.md`.
6. Set `capabilities.supplierResponses` and `REPLIES_CONNECTED` only when all of this exists.
