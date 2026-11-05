# 13 — Master Development Backlog

Complexity is a relative size (S/M/L/XL) based on what the code currently contains, **not** a time estimate. Statuses refer to docs 01–12. Totals: **P0 4 · P1 18 · P2 14 · P3 8 = 44 tasks.**

## P0 — Critical
| ID | Module | Existing | Missing work | Depends on | Size | Acceptance criteria |
|---|---|---|---|---|---|---|
| P0-01 | Auth hardening | Working login/register | Per-IP and per-account rate limiting + lockout on login/register/me | – | M | 6 failed logins in 10 min from one IP/account return 429; limit survives across serverless instances (shared store) |
| P0-02 | Credential hygiene (ops) | Credential shared in chat; Atlas open to `0.0.0.0/0` | Rotate DB password, restrict network access, delete test users, set Vercel env vars | – | S | Old password rejected; Atlas allowlist restricted; no `@example.com` test users remain |
| P0-03 | Raw data exposure | Raw CSV/XLSX incl. seller contact columns in `public/` (git-ignored) | Move out of `public/`; update `scripts/build-catalog.mjs` paths | – | S | No raw data file reachable by URL from a built deployment |
| P0-04 | Data licensing | Public repo includes research-licensed `db/seed/products.csv`, hotlinked images | Decide: private repo, licensed/own data, or remove | Business decision | S | Written decision; repo/data state matches it |

## P1 — Essential
| ID | Module | Existing | Missing work | Depends on | Size | Acceptance criteria |
|---|---|---|---|---|---|---|
| P1-01 | Authorization foundation | `role` string only | `requireUser/requireRole` helpers, middleware for `/account`, `/supplier`, `/admin` | – | M | Unauthenticated/unauthorised requests to protected routes/APIs get 401/403 (tested) |
| P1-02 | Catalog in MongoDB | CSV in memory (`data.ts`) | Collections + indexes for sellers/categories/products; replace data layer; DB-level pagination | P0-04 | L | Pages read from Mongo; indexes cover search/filter/sort; no CSV read at runtime |
| P1-03 | Company entity | Fields embedded in `users` | `companies` collection, link to users, profile edit page | P1-01 | L | Supplier can create/edit company; products/leads reference `companyId` |
| P1-04 | Requirements | UI + stub | API, collection, buyer confirmation, validation | P1-01 | M | Submitted requirement is stored, visible to its owner, returns real success |
| P1-05 | Inquiries | UI + stub | API + collection for product/supplier inquiries | P1-03 | M | Inquiry persisted and linked to buyer, product, company |
| P1-06 | Lead routing | none | Distribute requirements to matching suppliers; lead status | P1-04, P1-05 | L | Matching suppliers get a lead record; status transitions tracked |
| P1-07 | Supplier dashboard + lead inbox | none | Pages and APIs | P1-06 | L | Supplier sees only their own leads (IDOR-tested) |
| P1-08 | Quotations | none | Model, supplier submit, buyer view and compare | P1-07 | L | Supplier submits; buyer sees all quotes for a requirement side-by-side |
| P1-09 | Buyer dashboard | none | Requirements, inquiries, quotations pages | P1-04, P1-08 | M | Buyer sees own records only |
| P1-10 | Email verification + password reset | none | Email service, tokens, pages | Email provider | M | Unverified accounts restricted; reset link works once and expires |
| P1-11 | Supplier product CRUD + uploads | none | Endpoints, forms, object storage | P1-03 | XL | Supplier adds/edits product with images stored in object storage |
| P1-12 | Verification / KYC | none | Document upload, status model, admin review | P1-11, P1-13 | L | Only approved suppliers show a Verified badge sourced from data |
| P1-13 | Admin foundation | none | Admin role bootstrap not reachable from public signup, RBAC, audit log | P1-01 | L | Admin pages gated; every admin action logged |
| P1-14 | Boundaries | defaults only | `error.tsx`, `not-found.tsx`, `loading.tsx`, 401/403 pages | – | S | Failures show branded pages |
| P1-15 | Deployment + CI | Unverified Vercel link | Project connected, env vars, CI running lint/tsc/build | P0-02 | S | Push to main deploys; CI blocks on failure |
| P1-16 | Automated tests | none | Unit tests (validators, auth), e2e (signup→inquiry) | – | M | CI runs tests on every PR |
| P1-17 | Security headers + dependencies | none | CSP/HSTS/X-Frame-Options/Referrer-Policy; resolve advisories (`postcss`/`next`) | – | M | Headers present in responses; `npm audit` high = 0 |
| P1-18 | Replace sample content | Hardcoded constants | DB-driven home/category/industry content, real stats | P1-02 | L | No sample flags remain in `docs/MISSING_ASSETS.md` for these areas |

## P2 — Important
| ID | Module | Existing | Missing work | Depends on | Size | Acceptance criteria |
|---|---|---|---|---|---|---|
| P2-01 | Search | In-memory match | Indexed search, autocomplete, typo tolerance | P1-02 | L | Autocomplete under 200 ms on full data |
| P2-02 | Discovery | Basic filters | Attribute model, comparison, related products | P1-02 | L | Compare 2–4 products; related items shown |
| P2-03 | Notifications | none | Email + in-app | P1-10 | L | Supplier notified of new lead; buyer of new quote |
| P2-04 | Messaging | none | Threads per inquiry, attachments | P1-05 | L | Messages persisted with access control |
| P2-05 | Reviews | none | Ratings, moderation | P1-13 | M | Only verified interactions can review |
| P2-06 | Saved items | none | Wishlist, saved suppliers, recently viewed | P1-01 | M | Persisted per user |
| P2-07 | Subscriptions and billing | none | Plans, gateway, invoices, refunds | P1-03 | XL | Supplier can pay and receive an invoice |
| P2-08 | Ranking and featured | Hardcoded featured | Ranking rules, paid placement | P2-07 | M | Featured items driven by data |
| P2-09 | Analytics | none | Supplier and admin dashboards | P1-06 | L | Views/leads/quotes metrics shown |
| P2-10 | SEO | Page metadata only | XML sitemap, `robots.txt`, JSON-LD, canonicals | P1-02 | M | Sitemap lists all public URLs; valid structured data |
| P2-11 | Abuse and spam | none | Duplicate detection, spam filters, report-abuse flow | P1-06 | M | Duplicate leads merged/flagged |
| P2-12 | Legal/info content | 23 placeholders | Real policies/help/contact (written by the business) | Business | M | No placeholder remains |
| P2-13 | Image pipeline | PNG+JPG duplicates, hotlinks | Dedupe, WebP/AVIF, own storage/CDN | P1-11 | M | `public/` size and LCP targets met |
| P2-14 | Ops | `console.error` | Error monitoring, backups, shared rate-limit store | P1-15 | M | Alerts on errors; restore tested |

## P3 — Enhancement
| ID | Module | Missing work | Size |
|---|---|---|---|
| P3-01 | Real-time chat | WebSocket/SSE messaging | L |
| P3-02 | Recommendations | Personalised suggestions | L |
| P3-03 | Lead credits / commission | Business-model dependent | L |
| P3-04 | Automation | Reminders, lead expiry, scheduled jobs | M |
| P3-05 | Advanced reporting | Exports, BI | M |
| P3-06 | Localisation | Multi-language, regional search | L |
| P3-07 | API platform | Versioned public API, OpenAPI | M |
| P3-08 | CMS | Banners/campaigns management | M |
