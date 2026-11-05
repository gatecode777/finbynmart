# Page 34 — Security report

Scope: the saved-supplier routes and the two pages. Evidence is `saved-suppliers-test.mjs` (groups A, B, E, F) on a throwaway database; this is not a penetration test.

| Control | Result | Evidence |
|---|---|---|
| Authentication | 401 without session on all five routes, forged cookie 401, pages redirect to sign-in with no supplier data | A-01, A-03, A-04 |
| Authorization (role) | Supplier accounts get 403 on every route | A-02, H-16 |
| Object-level access (IDOR) | B cannot remove A's bookmarks (single, bulk), cannot compare A's suppliers (404, nothing of them), cannot clear A's list | B-03 to B-06, E-05 |
| Identity from the session only | `buyerId` / `userId` in the query ignored | B-02 |
| Bulk safety | 1 to 20 keys, de-duplicated; invalid key, empty, non-list or 21 keys refused (400) before any write; the real outcome per key returned | E-02, E-03, unit K-01 to K-03 |
| Destructive confirmation | Clear All needs `confirm: true` (a string "yes" is refused); only the caller's rows go; logged (count only) | E-04 to E-06 |
| Input validation | slugs, verification enum, sort enum, search ≤ 60, paging bounds; operator-style input never reaches the database | C-16, unit Q-01 to Q-08 |
| Information exposure | Allow-listed output: no contact data, no user id, no research rating, no logo or banner | C-05 |
| Selection is not authority | The server re-validates every key and re-reads the buyer's list; compare accepts only the buyer's own saved, still-listed suppliers | F-05, B-05 |
| Availability | A supplier that left the catalogue offers no contact, profile or compare; bookmarks never bypass the live catalogue | C-02, F-05 |
| Caching | `private, no-store`; pages `noindex` | A-01, C-01, H-01 |
| Rate limiting | Bulk 30 / 10 min, clear 10 / 10 min, compare 120 / 10 min per buyer; shared save 60 / 10 min | Implemented; the limiter is cleared by the suite, so the limits themselves are not asserted |

Honest gaps: no CSRF token beyond the cookie's SameSite setting and JSON content type (as elsewhere); security headers remain the open item of `docs/audit/11_SECURITY_AUDIT.md`; the rate-limit rules have no dedicated test; there is no supplier-side authorization because no supplier action exists; the contact path is the existing inquiry form, whose own protections are covered by the Page 13 suite.
