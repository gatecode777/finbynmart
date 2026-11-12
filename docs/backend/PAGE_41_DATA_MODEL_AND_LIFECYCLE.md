# Page 41 — data model, lifecycle and permission rules

## `inquiry_messages` (new, bounded)
`{ _id, inquiryId, inquiryReference, supplierKey, supplierCompanyId, buyerId, type: RESPONSE | CLARIFICATION, body, authorUserId, authorName, createdAt }`. All identity fields are written by the server: `supplierKey` and `buyerId` from the **inquiry record**, `supplierCompanyId` and `authorUserId` from the session, `authorName` = the company's display name (the only author detail a buyer may see), `createdAt` = server time. Rows are never edited or deleted. One index: `inquiry_messages_page` `(inquiryId, createdAt −1, _id −1)` — the only access path; both page reads (first and cursor) examine ~21 documents however long the history. Every read also filters by the party (the supplier's seller keys, or the buyer's id), so a row of another party is unreachable even with a guessed id or cursor.

## Reused / extended
`inquiries` (status + `statusHistory`, actor `"system"`), `idempotency_keys` (unique company + user + operation + key), `notification_outbox` (now generic: quotation submitted / revised / withdrawn, inquiry response, clarification), `notifications` via `notifyBuyer` (deduplicated by `inquiry-message:<id>`), `security_events` (audit: user, company, reference, message id; **never the message text**). `SupplierPermissions.respondToInquiries` (additive).

## Lifecycle: what a message does to the inquiry
The inquiry is addressed to one seller, so the shared lifecycle is the supplier's; no second state is stored. Each step below is a transition `canTransition` allows, recorded in `statusHistory`:
| Message | From | Steps |
|---|---|---|
| RESPONSE | NEW / NOTIFIED | IN_PROGRESS → REPLIED |
| RESPONSE | IN_PROGRESS | REPLIED |
| RESPONSE | REPLIED / QUOTED | none (never downgraded) |
| CLARIFICATION | NEW / NOTIFIED | IN_PROGRESS (the supplier is handling it) |
| CLARIFICATION | anything else | none (there is **no "waiting for buyer" status**, so none is set) |
| any | CLOSED / CANCELLED / REJECTED | refused (409) |
A message never closes, cancels, rejects, quotes, accepts, orders or pays anything. The status update is conditional on the status read inside the transaction (a concurrent change makes it a 409). A guest inquiry cannot be answered (no buyer account).

## Atomicity
One transaction (`snapshot` read concern, `majority` write concern): re-read and eligibility of the inquiry → message insert → conditional status steps → outbox row → idempotency record. If any step fails (tested by failing the last one), **nothing** persists. After the commit: audit event, then the buyer's in-app notice from the outbox. The success of the send and the notice's delivery are separate facts; a failed delivery never repeats or undoes the message, and is recovered the next time the supplier opens Quotations or an inquiry (a scheduled processor would remove that dependency: BLOCKED, none exists).

## Permissions
`respondToInquiries` (owner: true). Suspended company (revoked membership) = 403 on every route and redirect on every page. A role without the flag sees the form replaced by "Your role cannot respond to inquiries." and the API answers 403 (the predicate is unit-tested; the project has only the owner role today, so a real second role could not be exercised end to end).

## Privacy (role-specific DTOs, not hidden fields)
Detail: buyer business name + "Registered buyer" only. No e-mail, phone, address, buyer id, notes, other inquiries or another supplier's data is selected. Message rows expose id, type, label, body, author name, time. Activity never includes security logs, viewed / read / delivered events, orders or payments.
