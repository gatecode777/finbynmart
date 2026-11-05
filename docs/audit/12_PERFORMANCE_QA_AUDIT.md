# 12 — Performance and Quality Audit

## Checks actually run this session (2026-11-02)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass, no warnings (note: `next lint` is deprecated in Next 16) |
| `npm run build` | Pass; 20 static pages generated |
| `npm audit --omit=dev` | 2 findings (1 high `postcss`, 1 moderate `next` via postcss) |
| Browser render | Homepage only, headless Chrome (1440 px; 390 px via iframe) |
| Lighthouse / axe / Web Vitals | **Not run** (no tooling in this environment) |
| Unit / integration / e2e tests | **None exist** |

## Build output (from `next build`)
- Homepage: 5.58 kB page JS, 118 kB first-load JS. Shared JS 103 kB.
- Largest first-load: `/category/[slug]` 123 kB, `/suppliers/[slug]` 120 kB.
- Routes marked dynamic (ƒ): `/[page]`, `/categories/[slug]`, `/category/[slug]`, `/industries/[slug]`, `/products`, `/products/[slug]`, `/search`, `/suppliers`, `/suppliers/[slug]`, and the API routes. Static (○): `/`, `/categories`, `/industries`, `/post-requirement`, sign-in/up, register-supplier, how-it-works, sitemap.

## Frontend findings
| ID | Finding | Evidence |
|---|---|---|
| F1 | `public/` is 21 MB; categories/industries/hero exist as both PNG and JPG; several PNGs are 600–900 KB (e.g. supplier images ~0.9 MB, hero 692 KB) | `du`, file listing |
| F2 | Catalog product images are hotlinked from Myntra and served `unoptimized` (no resizing, availability and hotlink risk) | `MediaTile.tsx` |
| F3 | Fonts load through `next/font` (self-hosted, `display: swap`): good | `layout.tsx` |
| F4 | Unused dependency `framer-motion` | `package.json` vs `src/` |
| F5 | Only 15 client components; the rest are server components: good | grep |
| F6 | The hero image uses `priority`; category/industry images are not lazy-tuned explicitly (Next default lazy loading applies) | |
| F7 | `/category/[slug]` and `/products/[slug]` are `force-dynamic`, so they cannot be cached statically | page files |

## Backend findings
| ID | Finding |
|---|---|
| P1 | The catalog (~4.4 MB of CSV: 21k products, 90k size rows) is parsed into memory per server instance: cold-start and memory cost on serverless |
| P2 | No pagination at the data layer; slices are taken from in-memory arrays |
| P3 | MongoDB: one query per auth request, one unique index. No slow-query or N+1 risk exists yet |
| P4 | No caching layer, no queue, no rate limiter |

## Quality findings
| ID | Finding |
|---|---|
| Q1 | Zero automated tests and no CI pipeline |
| Q2 | No error monitoring (only `console.error`) |
| Q3 | No `error.tsx`/`loading.tsx`/`not-found.tsx` boundaries |
| Q4 | README is empty of setup instructions; docs referenced by code are missing |
| Q5 | Tooling warns that `next lint` will be removed in Next 16 |
