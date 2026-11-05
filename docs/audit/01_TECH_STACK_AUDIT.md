# 01 — Tech Stack Audit

Audit date: 2026-11-02. Evidence: `package.json`, `next.config.ts`, source under `src/`, `db/`, `scripts/`. Nothing below is taken from documentation alone.

## Instruction/doc files found
| File | State |
|---|---|
| `CLAUDE.md` | Present, read. Project rules and design tokens. |
| `README.md` | One line (`# finbynmart`). No setup/env docs. |
| `DESIGN.md` | **Does not exist** (referenced by the audit brief). |
| `docs/MISSING_ASSETS.md`, `docs/IMAGE_SOURCE_MANIFEST.md` | Present. Track sample data and image sources. |
| `docs/EXISTING_WEBSITE_AUDIT.md`, `docs/API_INTEGRATION.md` | **Referenced in `src/lib/api/*.ts` comments but do not exist.** |
| `docs/site_inventory.json`, `sitemap.xml`, `homepage_raw.html` | Historical data on the old fashion site. |

## Frontend
| Item | Actual |
|---|---|
| Framework | Next.js 15 App Router (`^15.1.7` declared; 15.5.x installed per dev output), Webpack |
| React | 19 |
| TypeScript | 5.7 (`tsc --noEmit` passes) |
| Styling | Vanilla CSS + CSS Modules, design tokens in `src/styles/variables.css`. No Tailwind (per CLAUDE.md). |
| Fonts | `next/font/google`: Anton (h1/h2), Montserrat (UI) |
| Icons | `lucide-react` |
| Component library | None (custom `src/components/ui/*`, 18 primitives) |
| State management | None (local `useState` only). 15 files use `"use client"`. |
| Form validation | Hand-written validators in `src/lib/validations/*` (3 files). No Zod/Yup. |
| Animation | `framer-motion` is a dependency but **no source file imports it** (unused dependency). |
| `clsx` | Used. |
| Auth in UI | Client `AccountLink` fetches `/api/auth/me`; account forms call `/api/auth/*` through `src/lib/api/account.ts`. |

## Backend
| Item | Actual |
|---|---|
| Language/framework | TypeScript, Next.js Route Handlers only. No separate backend service. |
| API routes | 4, all under `/api/auth` (login, register, logout, me). |
| Auth | Custom: scrypt password hashing, HMAC-SHA256 signed cookie `finbyn_session` (httpOnly, SameSite=Lax, Secure in production, 7 days). |
| Authorization/RBAC | Two roles stored on the user (`buyer`, `supplier`). **No code anywhere checks the role.** No admin role. |
| Middleware | **None** (`middleware.ts` absent). |
| Business logic layers | `src/lib/auth`, `src/lib/catalog` (read-only), `src/lib/validations`. No services for requirements/inquiries/quotations. |
| File upload | None. |
| Email/notifications | None. |
| Background jobs/queues | None. |
| Stubbed integrations | `src/lib/api/requirements.ts`, `supplierInquiry.ts` intentionally return a "not connected" error. |

## Database
| Item | Actual |
|---|---|
| Live DB | MongoDB Atlas via `mongodb` driver 7.x. Connection promise cached on `globalThis` (`src/lib/db/mongo.ts`). |
| Collections in use | `users` only. |
| ORM | None (raw driver). |
| Indexes | `users.email` unique (created lazily at first use). |
| Catalog "database" | CSV files in `db/seed/` (21,392 products, 90,537 size rows, 1,200 sellers, 118 categories) loaded into memory by `src/lib/catalog/data.ts`. `db/schema.sql` + `db/catalog.sqlite` are build artifacts of `scripts/build-catalog.mjs` and are not read by the running app. |

## Infrastructure
| Item | Actual |
|---|---|
| Hosting | Intended Vercel. **No deployment could be verified** (no Vercel status on the GitHub commits; the guessed `finbynmart.vercel.app` serves the old site). No `vercel.json`. |
| Source control | GitHub `gatecode777/finbynmart`, public repo, branch `main`. |
| CI | None (`.github/` absent). |
| Storage / image CDN | None. Local `public/images` (21 MB) plus hotlinked Myntra product images served `unoptimized`. |
| Cache/Redis | None. |
| Email service | None. |
| Payment gateway | None. |
| Logging/monitoring | `console.error` only. No Sentry/APM. |
| Tests | **None** (no test files, no test runner configured). |

## Findings
1. The stack is a single Next.js app. Everything beyond accounts and catalog browsing is unbuilt.
2. `framer-motion` is dead weight; `next.config.ts` image allow-list still names the old `www.finbynkart.com` host.
3. Two docs referenced from code do not exist.
