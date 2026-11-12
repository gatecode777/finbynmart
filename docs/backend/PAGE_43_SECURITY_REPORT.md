# Page 43 — security report

Scope: `/supplier/quotations/create`, the picker / context / products / draft / preview / submit APIs. Evidence = `43-supplier-create-quotation-test.mjs` (two servers, throwaway database) and `43-quote-rules-unit-test.mjs`. Not a penetration test.

| Risk | Control | Verified by |
|---|---|---|
| Unauthenticated access | `requireSupplierApi/Page`; pages redirect to sign-in, APIs 401 | A-01, A-04 |
| Wrong role | 403 JSON on all new routes; `/forbidden?portal=supplier` on pages | A-02, A-05 |
| Revoked membership | a suspended company is 403 on the new routes | A-03 |
| Staff submit permission | `permissions.manageQuotations` checked in the service (create, save, preview, submit); the only role today is the owner, so a role without it could not be exercised end to end | code path + A-03 |
| IDOR on inquiry / quotation / draft / product | `supplierKey ∈ sellerKeys` in every query; identical 404 | B-08, C-05, D-06, J-03, J-07 |
| Forged ownership, status, totals, author | server derives seller / buyer from the inquiry, company and user from the session; allow-listed input; totals recalculated | C-02, C-03, D-05, F-04, G-04 |
| Forged tax rule / changed tax policy | rule id must be in the configured list; rule version compared at submit | E-06, F-05, S-04 (unit) |
| Silent price change | `expectedTotal` compared; mismatch is a 409 with the new calculation; a changed total in the browser un-ticks the confirmation | F-04, K-21 |
| Duplicate submission | unique idempotency scope + transaction + unique open-quotation index | G-10…G-12, H-01…H-05 |
| Partial commit | one transaction; a failure of the last step rolls everything back | I-01, I-02 |
| CSRF | `isCrossSiteWrite` on every write | A-06 |
| Mass assignment / operator injection | typed allow-list normaliser; arrays / objects refused | C-03, C-07, N-01…N-07 (unit) |
| Oversized / malformed bodies | 413 over 24 kB, 400 for non-objects | C-08 |
| Stored XSS | notes and names are plain text, rendered as text; the dialog and summary escape | (React text rendering; no `dangerouslySetInnerHTML` in the new code) |
| Abuse | exact write limiter (save 120 / 10 min, submit 20 / 10 min); read limiter on lists | G-11 of Page 42, rate-limit groups |
| Private data in cache | `no-store`; pages `force-dynamic`, `noindex` | headers on every route |
| Draft exposure to the buyer | DRAFT hidden by every buyer query; the draft's reference is a 404 for the buyer | C-11 |
| Notification recipient manipulation | recipient is the inquiry's `buyerId`, never a request field | G-06 |

## Open items
One login per company: no staff roles or membership expiry to test. No attachments, PDF or e-mail exist (BLOCKED, not tested). The outbox retries only when the supplier returns to a list or inquiry page (no scheduler). No dependency or dynamic scan was run; Chrome only.
