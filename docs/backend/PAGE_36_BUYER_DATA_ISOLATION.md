# Page 36 — Buyer data isolation

- Identity comes only from the session. `buyerId` in a query string or body is ignored (list) or refused (create).
- Every read is `{ buyerId: <session id> }` plus the filter: list, summary, detail, attachment download, related picker.
- Another buyer's ticket, an unknown reference and a malformed reference return the **same** 404 body ("That ticket was not found.") on the API and the site's 404 page on the ticket route: no existence oracle.
- Attachments are downloadable only by the ticket's owner; ids are 16-hex and path-like ids are rejected before any file access.
- Related records are resolved against the buyer's own inquiries/quotations/orders; another buyer's reference is refused 400 at creation.
- The notification created on submission goes to the owner only.
- Suppliers get 403 on all buyer routes and see no tickets on the page; anonymous visitors get 401 (routes) or a sign-in redirect (pages).
- DTOs are allow-listed: no buyer id, internal id, agent, priority, idempotency key, storage reference, notification record or internal notes ever leaves the server (test D-06).
- Verified by tests A-01–A-06, C-07, D-01–D-06, H-17, H-18.
