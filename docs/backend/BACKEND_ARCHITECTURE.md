# Backend architecture (as built through Pages 01–04)

Last updated 2026-11-02. This describes what exists in the repository, not a target design. Schema: `DATABASE_SCHEMA.md`. Endpoints: `API_REFERENCE.md`. Open security items: `docs/audit/11_SECURITY_AUDIT.md`.

## Shape

Next.js 15 App Router route handlers under `src/app/api/`, thin on purpose. Each handler authenticates, validates, rate-limits, calls a small service module, and answers in one JSON shape. There is no separate server process, queue, cache service or search service.

```
Browser ──► route handler (src/app/api/**/route.ts)
              ├─ session   src/lib/auth/session.ts        signed cookie → user id
              ├─ validate  src/lib/auth/http.ts           clean(), cleanMultiline(), readSmallJson(), fail(), tooMany()
              ├─ resolve   src/lib/catalog/productRef.ts  product / supplier key → verified public record (server side)
              ├─ limit     src/lib/security/rateLimit.ts  fixed-window counter in MongoDB
              └─ persist   src/lib/{requirements,inquiries,wishlist}/service.ts → MongoDB (src/lib/db/mongo.ts)
```

## Two data stores, on purpose

| Store | Holds | Access |
|---|---|---|
| MongoDB Atlas (`mongodb` 7.x driver, one shared client per process, `MONGODB_DB`, default `finbynmart`) | Everything users create: `users`, `requirements`, `inquiries`, `wishlists`, `rate_limits` | `getDb()` in `src/lib/db/mongo.ts` |
| CSV seed files `db/seed/*.csv`, loaded into memory (and the sample B2B listings in `src/lib/constants/`) | The read-only product and supplier catalog: 21,392 products, 1,200 fictional sellers, categories, sizes | `src/lib/catalog/` (server-only; `data.ts` is the one file to replace if the catalog moves to a hosted database) |

Consequence: user records reference products and suppliers by **key**, not by a database id. A catalog product key is its numeric id (`"1163"`), a sample B2B product key is its slug, a catalog supplier key is the seller id (`"SLR0873"`), a sample supplier key is its slug. The server resolves every key against the catalog before storing anything; a key that does not resolve is refused.

## Request pipeline for a write

1. **Authenticate.** `getCurrentUser()` reads the `finbyn_session` cookie (HMAC-SHA256 signed token carrying the user id and expiry, 7 days, `HttpOnly`, `SameSite=Lax`, `Secure` in production) and loads the user. No user: 401.
2. **Read the body** with `readSmallJson()`: refused when `content-length` exceeds the limit (10 kB by default, 1 kB for the wishlist) or the JSON is not an object.
3. **Validate** each field with `clean()` (trims, strips control characters, collapses whitespace, caps the length; returns `""` for any non-string, so objects such as `{"$gt":""}` become empty and fail validation) and explicit rules (whole-number quantity 1–1,000,000, required text). Failures answer 400 with per-field messages.
4. **Resolve** product and supplier on the server. The client cannot name a supplier that does not own the product.
5. **Rate-limit**, after validation, so a typo never uses up a buyer's quota (see the table in `API_REFERENCE.md`). Over the limit: 429 with `Retry-After`.
6. **Persist** through the service, which also detects an identical submission within 10 minutes (409) and leaves optional fields out instead of storing `null`.
7. **Answer** `{ ok: true, ... }` (201 for created). Unexpected errors are logged on the server and answered with a generic 503 message; internals are never returned.

Response convention (kept from the existing auth routes instead of introducing a second one): success `{ "ok": true, ... }`; failure `{ "ok": false, "message": "...", "fields": { "<name>": "..." } }`. The UI shows a success message only after receiving `ok: true` from the server.

## Rate limiter

`rateLimit(key, limit, windowSeconds)` keeps one document per key and window in `rate_limits` (`_id = "<key>:<window number>"`, `$inc` with upsert), with a TTL index on `expireAt`, so the limit holds across serverless instances without Redis. It fails **open**: if MongoDB is unreachable the request is allowed and the route's own database call then fails and reports the problem. Keys: per signed-in user for writes, per client IP (`x-forwarded-for`, trusted on Vercel) for sign-in and registration.

## Authorization model today

- Every write requires a signed-in user and only ever touches that user's own rows (`userId`/`buyerId` comes from the session, never from the request body).
- **Roles are not enforced yet.** `users.role` is `buyer` or `supplier`, but the new endpoints accept any signed-in account (a supplier account can post a requirement or save a product). Role checks, supplier ownership of products and admin roles belong with the supplier and admin dashboards.
- There is no CSRF token or Origin check. The `SameSite=Lax` cookie is not sent on cross-site POST and DELETE requests, which covers the current endpoints; add an explicit check before adding cross-origin clients.
- Sign-in and registration are rate-limited (10 per 10 minutes and 10 per hour per IP). There are no security headers (CSP, HSTS) yet.

## Page-to-backend map

| UI | Endpoint | Collection |
|---|---|---|
| Homepage and `/post-requirement` requirement form; bulk banners on Pages 03 and 04 | `POST /api/requirements` | `requirements` |
| Product page "Get Best Quote" | `POST /api/inquiries` | `inquiries` |
| Heart on product cards (Pages 03, 04) | `GET/POST /api/buyer/wishlist`, `DELETE /api/buyer/wishlist/[productId]` | `wishlists` |
| Sign in, sign up, supplier registration | `/api/auth/*` | `users` |

Public read endpoints (`/api/public/...`) do not exist yet: the category and product pages read the catalog directly in Server Components. They are planned with Pages 05–08.

## Testing

All tests run against a production build served from `.next-audit` on port 3100 with `MONGODB_DB=finbynmart_test`, never the live collections; the throwaway database is dropped afterwards (`docs/page-reports/tools/drop-test-db.mjs`). Scripts are in `docs/page-reports/tools/` and need `puppeteer-core`, a local Chrome and `.env.local`. Results are in the page reports. There is no unit-test framework and no CI in the project.

## Known limits

- Catalog and sample data live in process memory; changing the CSV files needs a server restart.
- Inquiries and requirements have no supplier- or admin-facing read endpoints yet, so nothing consumes them.
- No email or notification is sent for any submission.
- No rate limiting on anonymous read pages; none is needed until public API endpoints exist.
