# Page 37 — Buyer data isolation

- Identity only from the session. `buyerId`, `userId`, `ticketId` in a query string are ignored; in a body they are refused 400.
- Every route resolves the ticket with `{ ticketReference, buyerId: <session> }` first (`loadOwnTicket`); messages, events, files, related record, feedback and reopening are then reached only through that ticket's `_id`. A message query is `{ ticketId, visibility: "buyer" }`: another ticket's messages and internal notes cannot appear.
- Another buyer's ticket, an unknown reference and a malformed one answer the identical 404 body on all eight ticket routes and the site 404 on the page; the reference is an identifier, not a credential, and no enumeration signal exists (same message, same shape).
- Files: found on the ticket's own attachments or on a buyer-visible message of that ticket; the id is 16 hex characters; a file of another ticket, of an internal message, a path-like id: 404.
- Sender and role are server-assigned: a buyer cannot write a `support` message, an internal one, or choose a status (400 on any such field).
- Feedback and reopening act on the session buyer's ticket only (404 otherwise); the unique feedback index is per ticket.
- Related records are re-read with the buyer's id; a record that stopped being theirs shows "not available" with nothing of it.
- Answers are allow-listed DTOs: no buyer id, ticket id, internal id, storage reference, e-mail status, idempotency key, internal notes or events.
- Suppliers get 403 on every route and see no ticket; anonymous visitors 401 (routes) or a sign-in redirect (page).
- Checked by tests A-01–A-04, B-03–B-07, C-02, D-13, E-05, G-03, H-03, I-03, I-09, K-15 (Page 37 suite).
