# Page 44 — security report

Scope: `/supplier/quotations/[reference]?version=n` and the versions / compare / revisions / activity / withdraw APIs. Evidence = `44-supplier-quotation-versions-test.mjs` and `44-quotation-versions-unit-test.mjs`. Not a penetration test.

| Risk | Control | Verified by |
|---|---|---|
| Unauthenticated / wrong role / revoked membership | 401 / 403 JSON on all routes; page redirects (sign-in, `/forbidden?portal=supplier`) | A-01…A-04 |
| Cross-supplier quotation, version or compare access (IDOR) | every query carries `supplierKey ∈ sellerKeys`; unknown, malformed and foreign references and unknown or foreign versions are the same 404; a malformed `?version` is one identical 400 (checked before any read) | B-03, B-04, C-05, D-04, F-02, H-05 |
| Version-reference substitution | compare searches **one reference** only; a version that exists only in another quotation is a 404; versions are whole numbers 1 … 100,000 (anything else: 400 on the API, 404 on the page) | D-03, D-04, B-03 |
| Draft exposure to the buyer | a revision draft is `isCurrent:false` and `DRAFT`: every buyer query excludes it; no event is written; no notification | E-04 |
| Editing submitted history | no route edits a submitted version; revision creates a new draft; PATCH on a submitted version is 409 | E-03, E-13, F-01 |
| Accepted version immutability | revision refused (`immutable`, no amendment process); withdrawal refused; supersede is conditional on the previous version still being SENT / REVISION_REQUESTED | F-01, F-07, F-08, G-06 |
| Withdrawing a newer offer while viewing an older version | `expectedVersion` must equal the current version | G-01 |
| Acceptance racing withdrawal / revision submission | conditional updates + transactions: exactly one outcome wins, never both | F-07, F-08, G-05 |
| Duplicate revision / withdrawal / notification | unique `(reference, version)`, idempotency scope, outbox key; five simultaneous requests produce one result | E-05…E-07, F-05, F-06, G-03, G-04 |
| Partial state | revision creation and withdrawal are transactions; a failure of the last step rolls back | F-09 |
| Forged fields (status, version, isCurrent, buyerId, supplierKey, createdBy) | never read from the body; the stored draft belongs to the real company and user | F-04 |
| CSRF | `isCrossSiteWrite` on revisions and withdraw | A-05 |
| Oversized / malformed bodies, operator injection | 413 / 400 / 422; reason is plain text; `{ $ne: "" }` as a reason is refused | F-03 |
| Stored XSS | notes, reasons and product text render as text; the page escapes them | H-07 |
| Snapshot tampering via live data | a submitted version is shown from its own stored data; the catalogue and tax configuration are not consulted | B-07, E-13, unit V-02 |
| PDF / attachment bypass, SSRF | no PDF route and no attachment route exist (404) | B-11 |
| Private data in cache | `no-store`; `force-dynamic`; `noindex`; no document cache exists | headers |
| Notification recipient manipulation | recipient = the quotation's stored `buyerId` | E-14, G-02 |

## Open items
One login per company (no staff roles, so "insufficient staff permission" is a unit-level predicate only). No PDF, attachments, e-mail, scheduler (BLOCKED). No dependency / dynamic scan; Chrome only.
