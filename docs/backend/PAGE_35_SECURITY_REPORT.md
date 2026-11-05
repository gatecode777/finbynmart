# Page 35 — Security report

Scope: the comparison routes and page. Evidence is `compare-products-test.mjs` (groups A, B, C, D, E) and `35-comparison-rules-unit-test.mjs` on a throwaway database; this is not a penetration test.

| Control | Result | Evidence |
|---|---|---|
| Authentication | Anonymous add, remove, clear and details: 401, private; the key list answers anonymous visitors with `authenticated:false` only; forged cookie 401; page redirects to sign-in | A-01, A-02, A-04, A-05 |
| Authorization (role) | Supplier accounts: 403 on add, clear and details | A-03 |
| Object-level access | B sees only B's list; B removing a product that is only in A's list changes nothing | C-01, C-02 |
| Identity from the session only | `userId` / `buyerId` in the body ignored | B-08 |
| Client cannot influence data | Only a product key is accepted and validated against the catalogue (unknown, empty, non-string: 404); prices, names, specifications, verification and category are always read from the catalogue; no raw document or operator is accepted | B-03, D-16 |
| The four-product limit | A database constraint (unique partial index on userId + slot): six simultaneous adds keep exactly four; a fifth is 409, never a silent swap | B-05, B-07 (run three times in a row after the fix) |
| Rate limiting | 60 requests per 10 minutes per buyer on writes; 61 quick adds end in 429 | B-09 |
| Information exposure | No contact data, user id, or supplier private data in the answer; no brand or SKU invented | D-07, D-18 |
| Product availability | A product that left the catalogue shows only its saved name, no link and no detail; removable by its stored key | D-08, D-09 |
| Caching | `private, no-store`; page `noindex` | B-01, G-01 |
| Inquiry safety | Add to Inquiry is a link to the existing inquiry form: comparing creates no inquiry (the test checks none exists after saving a product from the comparison) | G-01e, G-01f |

Honest gaps: no CSRF token beyond the cookie's SameSite setting and JSON content type (as elsewhere); security headers remain the open item of `docs/audit/11_SECURITY_AUDIT.md`; the supplier-eligibility revalidation the PRD asks for before an inquiry is the inquiry form's own job (Page 13 suite), not repeated here; the per-route rate limit is shared with the key list's writes and was checked only for add.
