# Page 05 security report

2026-11-02. What was checked and how. Nothing here is a penetration test; it is the controls of the new read endpoint and the page, tested with the scripts in `docs/page-reports/tools/`.

| Control | Result | Evidence |
|---|---|---|
| Query validation (API) | Page, limit, sort, prices, MOQ, unit, currency, text length and value lengths are validated; a bad value answers 400 with a per-parameter message | A4–A13 |
| Operator / injection | Parameters are read as plain strings; objects, arrays-in-brackets (`category[$ne]=x`) and operator JSON are never interpreted; no database query is built from the input (the data is searched in memory) | A11, A12, 5-28 |
| Regular expressions | None run on user input; search is substring tests over precomputed text; text capped at 100 characters and 8 words | code review, 5-28/5-29 |
| Unsafe strings in the page | `.*`, `(((`, `$where`, JSON, `<script>` and a 150-character query render as text (no crash, no reflected markup) | 5-28, 5-29 |
| Public fields only | `PublicProduct` is an explicit allow-list; the response contains no email, phone, owner name, pincode, ids or internal keys | A2, A18 (supplier object has exactly id, name, slug, url, city, state, verificationStatus, plus type when present) |
| Seller contact data | The loader never reads email, phone or owner columns | `src/lib/catalog/data.ts` |
| Verification claims | Catalog sellers are always `unverified`; no verified count or percentage is shown on the page | A18, 5-02 |
| Request volume | 120 requests per minute per address on the public API; 429 with `Retry-After` and a safe message; the counter is in MongoDB so it holds across instances; it fails open if the database is unreachable | A25 |
| Unsupported filters | `brand`, `availability`, `attributes`, `country` and non-INR `currency` fail loudly instead of being ignored | A8 |
| Private / unpublished data | No such records exist in the data (see the validation report); the visibility rules (known category, active seller) are enforced when the catalog loads | `PAGE_05_DATA_VALIDATION_REPORT.md` |
| Error handling | Unexpected errors are logged on the server and answered with a generic message (no stack, no paths) | route code |
| Wishlist, quote, requirement | Unchanged: authentication required, ownership by session user, server-side product and supplier resolution, rate limits (`BACKEND_ARCHITECTURE.md`); the page only passes context in links | 5-76, 5-77 and the Pages 1–4 backend suites |
| Caching | Public shared-cache headers on a read-only, non-personalised response; the page itself is dynamic | A22 |
| Request size | GET only; query values capped (80 characters, 60 values, 100-character text) | A10 |

## Open items

1. Roles are not enforced anywhere yet (documented in the architecture doc).
2. No security headers (CSP, HSTS) and no CSRF token; the cookie is `SameSite=Lax`.
3. The API rate limit costs one MongoDB round trip per request and fails open; a database outage disables the limit.
4. The public API returns sample listings (flagged `source: "sample"`), including their sample ratings and verified flag; hide them from the API if they must not be presented as real.
5. The per-address limit trusts `x-forwarded-for` (appropriate behind Vercel, spoofable elsewhere).
