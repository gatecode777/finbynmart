# Page 41 — security report

Scope: `/supplier/inquiries/[reference]`, `/api/supplier/inquiries/[reference]/{,responses,activity,quotations}`, and the buyer's read of the messages. Evidence = `41-supplier-inquiry-details-test.mjs` and `41-inquiry-rules-unit-test.mjs` against a throwaway database. Not a penetration test.

| Risk | Control | Verified by |
|---|---|---|
| Unauthenticated access | 401 on every route; page redirects to sign-in with no content | A-01, A-04 |
| Buyer / wrong role on supplier routes | 403 JSON (even for the buyer's own inquiry reference); `/forbidden?portal=supplier` on the page | A-02, A-05 |
| Revoked membership | suspended company: 403 everywhere | A-03 |
| Missing respond permission | `respondToInquiries` checked in the service; the form is replaced by the reason | unit E-04; (only the owner role exists, so not exercised end to end) |
| IDOR / cross-supplier inquiry, message, cursor | `supplierKey ∈ sellerKeys` on every inquiry and message query; identical 404; a cursor carries only `(time, id)` and is always combined with the inquiry and party filters | B-06, C-15, E-03, E-04, G-04 |
| No protected fetch before authorisation | `loadInquiry` runs only after `requireSupplierApi`; nothing is read for a foreign reference | B-06, G-04 |
| Forged ownership / author / recipient / time / status | the body accepts only `type`, `message`, `idempotencyKey`; anything else is a 422 naming it; identities come from the session and the inquiry | C-02, C-09, unit M-10 |
| Mass assignment / operator injection | typed parser; operator objects refused; message text containing operators is plain text | C-10, C-13, unit M-09 |
| Stored XSS (supplier side, buyer side) | messages are plain text, rendered as text; markup is stored unchanged and escaped on output | C-12, F-04, G-03 |
| CSRF | `isCrossSiteWrite` on the POST | A-06 |
| Oversized / malformed bodies | 413 over 24 kB; 400 for non-objects | C-11 |
| Duplicates (double click, retry, lost response) | unique idempotency scope, one transaction, unique outbox key | C-06…C-08, D-06 |
| Partial commit | all-or-nothing transaction (failure of the last step rolls back message, status, outbox, key) | D-01, D-02 |
| Closure racing a send | status update conditional inside the transaction; closed → 409; final state consistent | D-04, D-05 |
| Buyer data leakage | business name only; no e-mail / phone / id / private notes / other inquiries; message rows expose no internal ids | B-02, E-05 |
| Competing / other buyer's conversation | a buyer sees only messages of their own inquiry; another buyer gets 404 | F-01…F-03 |
| Notification recipient manipulation / content | recipient = the inquiry's `buyerId`; the notice carries no message text | C-04, C-17 |
| Buyer opted out | recorded as skipped; the answer never claims a notice | C-20 |
| Private data in cache | `no-store`, `force-dynamic`, `noindex` | G-01 |
| Rate limiting | send: exact limiter, 30 / 10 min per user | suite reset per group; 429 handled in the UI |

## Open items
No attachments (buyers cannot attach; suppliers cannot upload), no read tracking, no buyer reply, no e-mail, no scheduler for the outbox (BLOCKED). One login per company. No dependency or dynamic scan; Chrome only.
