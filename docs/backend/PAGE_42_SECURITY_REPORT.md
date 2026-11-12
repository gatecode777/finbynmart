# Page 42 — security report

Scope: `/supplier/quotations`, `/supplier/quotations/[reference]`, `/api/supplier/quotations/*`. Evidence = `42-supplier-quotations-test.mjs` (126 checks) and `42-supplier-quotation-rules-unit-test.mjs` (41), against a throwaway database. Not a penetration test.

| Risk | Control | Verified by |
|---|---|---|
| Unauthenticated access | `requireSupplierApi/Page`; pages redirect to sign-in with no data rendered | A-01, A-04 |
| Wrong role (buyer on a supplier route) | 403 on APIs, redirect to `/forbidden?portal=supplier` on pages | A-02, A-05, A-06 |
| Suspended company | 403 | A-03 |
| IDOR across suppliers (read, version, withdraw, export) | `supplierKey ∈ sellerKeys` inside the service and in the update filter; identical 404 for foreign / unknown / malformed | C-01…C-04, C-06, C-08, I-05, J-18 |
| Identity from the client (`companyId`, `supplierKey`, `buyerId`) | never read | C-05, C-06 |
| Inquiry of another seller leaking through an owned quotation | inquiry read only if addressed to an owned seller | C-09 |
| Status / price tampering | no PATCH (405), no document route, withdrawal body whitelist, acceptance only on buyer routes | E-13, E-14, F-02 |
| Withdrawal race with buyer acceptance | conditional atomic update on the status read | F-08 |
| Cross-site request forgery on writes | `isCrossSiteWrite` on withdraw and export (+ SameSite cookie) | F-04, G-10 |
| NoSQL operator injection | typed parser; arrays/objects refused; search escaped (`.*` is text) | D-07…D-09, Q-05, Q-08 |
| CSV formula injection | `csvCell` quotes every cell and prefixes `= + - @ tab CR` with `'` | unit C-01…C-04, integration G-04 |
| Buyer data exposure | business name only; no email, phone, id, address, private message, internal fields | D-22, E-07, G-03 |
| Abuse | 240 reads/min, 20 withdrawals/10 min, 10 exports/10 min per user | G-11 |
| Information in errors | generic messages; server logs carry only the error message text | review |
| Caching of private data | `Cache-Control: private, no-store`; pages `force-dynamic`, `noindex` | B-02, I-01 |
| Unbounded results | limit ≤ 50, page ≤ 1000, export ≤ 5,000 rows | D-20, G-01 |

## Open items (not fixed here)
- One login per company, no staff roles or membership expiry: `manageQuotations` is always true for the owner.
- `sellerKeys` is platform-set; there is no claim/verification flow, so no real supplier can see quotations until the platform links one.
- Exports are generated synchronously in the request (capped); there is no job queue, signed expiring URL or per-file storage, so none of those can be tested.
- No security headers or CSP were added (project-wide open item, `docs/audit/11_SECURITY_AUDIT.md`).
- The page was tested with Chrome only; no dependency, SAST or dynamic scan was run.
