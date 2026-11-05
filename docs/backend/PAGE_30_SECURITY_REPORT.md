# Page 30 — Security report

Scope: the buyer quotation routes and pages (Pages 29/30). Evidence is the automated suite `29-30-buyer-quotations-test.mjs` (groups A, B, F) against the throwaway database; this is not a penetration test.

| Control | Result | Evidence |
|---|---|---|
| Authentication | 401 without session, forged cookie 401, suspended account 401; pages redirect to sign-in | A-01, A-03, A-04, A-05 |
| Authorization (role) | Supplier accounts get 403 on every route | A-02, A-06 |
| Object-level access (IDOR) | Foreign, unknown, malformed, draft references: same 404 body; foreign quotations in a comparison: 404; foreign writes change nothing | B-02, B-03, B-05 to B-08 |
| Identity from the session only | `buyerId` / `userId` in the query ignored | B-04 |
| Mass assignment | Unknown body fields refused (400): status, buyerId, price cannot be sent | F-02 |
| Tampering with the record | DELETE, PUT, PATCH not exported (405); price unchanged | F-21 |
| Input validation | version integer ≥ 1, `confirm: true`, reason/message length and `<`/`>` refused, reasons from an allow-list, body size limits (4 kB / 1 kB), regex input in search escaped | F-01, F-11, F-14, C-06, C-09 |
| Race conditions | Conditional atomic updates plus unique partial index: two quotations of one inquiry accepted at once → one 200, one 409; five identical accepts → one winner; accept vs reject → consistent | F-16 to F-19 |
| Stale decisions | Old version → 409 `STALE`; expired, withdrawn, already decided → 409 | F-03 to F-05, F-08 |
| Information exposure | DTOs are allow-listed; no buyer id, internal ids, contact data, storage paths | C-10, D-08, D-10 |
| Caching | `private, no-store`; pages `noindex` | A-01, C-01, G-01, G-12 |
| Rate limiting | Decisions 30 per 10 min and comparisons 120 per 10 min per buyer (`buyerGuard`) | Implemented; not itself asserted by a test (the suite clears the limiter) |
| Output encoding | React text rendering only; no `dangerouslySetInnerHTML`; user-entered reasons/messages stored as text and refused if they contain `<` or `>` | code review, F-11, F-14 |

Honest gaps: no CSRF token beyond the cookie's SameSite setting and JSON content type (same as the rest of the project); security headers are still the open item in `docs/audit/11_SECURITY_AUDIT.md`; the rate-limit rule has no dedicated test; there is no audit log of buyer decisions beyond the `events` array on the quotation; attachment download is BLOCKED (no files are served, see `PAGE_30_ATTACHMENT_SECURITY.md`). Supplier-side authorisation does not exist yet because no supplier action exists.
