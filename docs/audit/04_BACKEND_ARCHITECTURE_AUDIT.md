# 04 — Backend Architecture Audit

Scope read: `src/app/api/**`, `src/lib/auth/*`, `src/lib/db/mongo.ts`, `src/lib/catalog/*`, `src/lib/api/*`, `src/lib/validations/*`.

## What exists (verified in code)
| Module | Files | State |
|---|---|---|
| Accounts | `api/auth/{login,register,logout,me}`, `lib/auth/*` | Working buyer + supplier sign-up, sign-in, sign-out, session lookup |
| Password hashing | `lib/auth/password.ts` | scrypt, 16-byte random salt, 64-byte key, `timingSafeEqual` comparison |
| Sessions | `lib/auth/session.ts` | Stateless HMAC token in httpOnly cookie, 7 days; `AUTH_SECRET` ≥ 32 chars enforced (throws if missing) |
| Mongo access | `lib/db/mongo.ts` | Shared client on `globalThis` |
| Catalog read layer | `lib/catalog/{data,queries,mappers,csv,slug}.ts` | Server-only, reads CSV into memory; only Active sellers; seller contact fields never read |
| Validation | `lib/validations/*` | Hand-written; account validators are re-run on the server |
| Stubs | `lib/api/{requirements,supplierInquiry}.ts` | Deliberately return "not connected" |

## What does not exist
Controllers/services for: requirements, inquiries, quotations, messaging, products CRUD, supplier company profile, verification/KYC, reviews, wishlist/saved suppliers, subscriptions, payments, invoices, notifications, email, file upload, CMS, admin, audit log, analytics, background jobs, scheduled jobs.

## Findings
| ID | Finding | Evidence | Severity |
|---|---|---|---|
| B1 | No rate limiting or lockout on login/register | Route handlers have no throttle; no middleware | High |
| B2 | Role is stored but never enforced; no authorisation layer | `grep` finds no role checks; `getCurrentUser` returns `role` only to the UI | High (becomes critical once protected data exists) |
| B3 | No server-side session revocation | Token is stateless; logout only deletes the cookie | Medium |
| B4 | Response shape is consistent only within auth: `{ok, message, fields}` for errors; `/me` returns `{user}`; no shared envelope for future APIs | `lib/auth/http.ts`, `me/route.ts` | Low |
| B5 | Register returns 409 "already registered" (account enumeration) while login uses a generic message | `register/route.ts` | Low |
| B6 | Supplier registration data is embedded in the user document; no `companies` entity, so one supplier cannot have multiple users and nothing can reference a company | `lib/auth/users.ts` | Medium (design) |
| B7 | Index creation happens lazily inside the data-access call (`indexReady`); acceptable now, fragile as collections grow | `users.ts` | Low |
| B8 | Catalog loaded from CSV at process start: ~4.4 MB parsed (21k products, 90k size rows) per cold serverless instance; no pagination at the data layer beyond in-memory slicing | `catalog/data.ts` | Medium (performance) |
| B9 | No transactions anywhere (not needed yet) | n/a | Info |
| B10 | `/api/auth/me` swallows all errors and returns `{user:null}`, hiding DB outages from the UI | `me/route.ts` | Low |

## Business-logic layering
Validation, persistence and HTTP concerns are separated reasonably in auth (`validations` → `users` → route). No logic lives in components beyond form state.

## N+1 / query risks
None today: the catalog is in-memory and Mongo is touched only for single-document user lookups.

## Not verifiable
Behaviour under load, Atlas performance, and anything requiring the deployed environment.
