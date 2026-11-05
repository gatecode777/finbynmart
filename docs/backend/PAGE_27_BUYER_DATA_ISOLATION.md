# Page 27 — Buyer data isolation

Every inquiry query begins with `buyerId` taken from the verified session (`requireBuyerApi` / `requireBuyerPage`; ACTIVE accounts only). No query, body, header or client state names the buyer.

| Threat | Control | Tested |
|---|---|---|
| Anonymous access | 401 on all routes, `no-store`; pages redirect to sign-in and come back | yes |
| Supplier accounts | 403 on all routes; the page shows "Buyer accounts only" | yes |
| Suspended / expired session | `getCurrentUser` returns nothing | yes (suspended) |
| Reading another buyer's list | the filter always includes the session's `buyerId`; a `buyerId`/`userId` parameter is ignored | yes |
| Reading another buyer's inquiry (IDOR) | detail and cancel look up `{ reference, buyerId }`; another buyer's, an unknown and a malformed reference all give the same 404 (API and page) | yes |
| Probing references | the same answer for all three cases; references are 40 random bits; the page is `force-dynamic` and never cached | yes |
| Raw id addressing | an inquiry that has a reference cannot be opened by its database id (404); only an old record without a reference is addressed by id | yes |
| Guest inquiries | have no `buyerId`; a guest inquiry that uses the buyer's e-mail address never appears and cannot be opened | yes |
| Cancelling someone else's | 404 by reference and by id; the record is unchanged | yes |
| Direct status changes | none exist (405); the cancel service is the only buyer write | yes |
| NoSQL injection | parameters are strings validated against allow-lists or regex-escaped; operator objects, JSON strings and bracket parameters do nothing (`q={"$ne":""}` is plain text, `supplierId[$ne]=x` is not a parameter) | yes |
| Query bounds | page ≤ 1000, limit ≤ 50, `q` ≤ 60, custom range ≤ 366 days, facets ≤ 100 | yes |
| Private data in the list | no message, delivery location, contact, consent, notification or idempotency field in any row (the owner-only detail returns the message to its owner) | yes |
| Cache | `private, no-store`; no shared or CDN caching of buyer data | yes |
| Related records | there are no quotations, responses, messages or attachments to authorise; the detail answer states that rather than inventing them | yes |

## Residual risks
- Reads are not rate limited (indexed and bounded); cancel is (30 / 10 minutes).
- No CSRF token beyond the same-site cookie (project-wide).
- Roles other than buyer and supplier are not enforced anywhere yet.
