# 06 — API Inventory and Coverage

Discovered from `src/app/api/**/route.ts`. No secrets are reproduced here.

## Endpoint inventory
| Method | Endpoint | Purpose | Auth | Role | Entity | Status |
|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | Create buyer or supplier account, start session | Public | – | users | Working; no rate limit, no email verification |
| POST | `/api/auth/login` | Verify credentials, start session | Public | – | users | Working; generic failure message; no rate limit |
| POST | `/api/auth/logout` | Delete session cookie | Cookie | any | – | Working; no server-side revocation |
| GET | `/api/auth/me` | Return current user or null | Cookie | any | users | Working; `no-store` header; errors swallowed |

Total HTTP endpoints: **4**. Methods present: POST ×3, GET ×1. No PUT/PATCH/DELETE. No search, filtering, sorting or pagination endpoints (catalog queries run in-process in server components, not over HTTP).

## Cross-cutting
| Aspect | State |
|---|---|
| Validation | Server-side for auth bodies; `str()` coerces every field to a string, which also blocks NoSQL operator injection |
| Error format | `{ok:false,message,fields?}` for auth only |
| Authorization | None needed yet; no role checks exist |
| Rate limiting | None |
| CORS | Next.js default (same-origin) |
| Versioning / OpenAPI | None |

## Frontend → backend map
| Page | Calls |
|---|---|
| `/sign-in` | POST `/api/auth/login` |
| `/sign-up`, `/register-supplier` | POST `/api/auth/register` |
| Header `AccountLink` | GET `/api/auth/me`, POST `/api/auth/logout` |
| `/post-requirement`, homepage requirement form | `submitRequirement()` stub → always errors |
| `/products/[slug]`, `/suppliers/[slug]` inquiry forms | `submitSupplierInquiry()` stub → always errors |
| `/products`, `/suppliers`, `/search`, `/category/*` | No API; server components read CSV/constants |

## Gaps
- **Frontend pages without APIs:** requirement form, supplier inquiry form, all catalog pages (no HTTP API for a future mobile app or client-side filtering).
- **APIs without consumers:** none.
- **Hardcoded/mock data:** homepage featured products/suppliers/industries/testimonials/stats, category pages (`categoryPages.ts`, 616 lines), supplier profile samples, industry pages, trust statistics, footer contact details (all flagged in `docs/MISSING_ASSETS.md`).
- **Missing endpoint families:** requirements, inquiries, quotations, messages, products CRUD, supplier/company profile, KYC, uploads, reviews, wishlist, notifications, subscriptions, payments, admin, analytics, password reset, email verification.
- **Broken integrations:** none verified; the two stubs are intentional and honest.
