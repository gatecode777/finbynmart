# Page 31 — Security report

Scope: the buyer order routes and pages. Evidence is the automated suite `31-buyer-orders-test.mjs` (groups A, B, E, F, G) on a throwaway database; this is not a penetration test.

| Control | Result | Evidence |
|---|---|---|
| Authentication | 401 without session, forged cookie 401, suspended account 401; pages redirect to sign-in with no order data | A-01, A-03 to A-05 |
| Authorization (role) | Supplier accounts get 403 on every route | A-02 |
| Object-level access (IDOR) | Foreign, unknown and malformed references: identical 404; foreign cancellation request: 404 and the order is byte-for-byte unchanged; foreign export returns only the caller's rows | B-02, B-04 to B-06 |
| Identity from the session only | `buyerId` / `userId` in the query ignored | B-03 |
| Mass assignment | Cancellation body refuses unknown fields (status, buyerId) | F-02 |
| Tampering | DELETE, PUT, PATCH not exported on an order (405); status unchanged | E-08 |
| Input validation | Every list parameter validated (status enum, currency code, supplier id, sort, page 1–1000, limit 1–50, search ≤ 60, date windows by the India-time rules); operator-style keys ignored; search text escaped, never a pattern | C-15, unit Q-01 to Q-08 |
| Race conditions | Conditional update on the exact status: five simultaneous cancellation requests give one 201, four 409, one event | F-07 |
| Business rules | Cancellation only before dispatch; repeat refused; no direct status change by a buyer | F-03 to F-06 |
| Information exposure | DTOs and CSV are allow-listed: no buyer id, internal ids, sort helper, contact data | C-16, E-06, G-03 |
| CSV injection | Cells starting `= + - @` tab CR are defused with an apostrophe | G-04, unit E-01 |
| Caching | `private, no-store` on every response; pages `noindex` | A-01, C-01, G-01, H-01 |
| Rate limiting | Cancellation requests 20 per 10 min, export 10 per 10 min per buyer (`buyerGuard`) | Implemented; the limiter is cleared by the suite, so the limits themselves are not asserted |
| Audit trail | Each export logs count, truncation flag and filter names (no values) in `security_events`; cancellation requests are in the order's own `events` | G-05, F-03 |
| Output encoding | React text rendering only; no `dangerouslySetInnerHTML`; reasons refused if they contain `<` or `>` | F-02 |

Honest gaps: no CSRF token beyond the cookie's SameSite setting and JSON content type (as elsewhere in the project); security headers remain the open item of `docs/audit/11_SECURITY_AUDIT.md`; no payment, invoice or shipment routes exist, so their authorization (webhook signature verification, signed invoice URLs) is not built or tested; there is no supplier or admin side to authorize; the rate-limit rules have no dedicated test.
