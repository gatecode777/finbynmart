# Vercel Fluid Active CPU audit (finbynmart)

Date 2026-11-23. Evidence: local production build (`next start`, throwaway in-memory MongoDB, Windows dev machine). **No Vercel invocation data was available**, so nothing below is a measured Vercel CPU figure. See "Check in Vercel" for what must be read from Observability.

## Findings (ordered by likely cost)
1. **Link prefetch storm (measured).** Every `<Link>` in the viewport is prefetched in production. One homepage view made 16 prefetch requests on load and 69 background requests after scrolling to the footer (`/products`: 13 / 59, a category page: 26 / 83); about 65 distinct URLs per homepage view (every category, product, supplier, industry and footer link). Most targets were dynamic pages, so each is a function invocation. Tool: `docs/performance/tools/prefetch-count.mjs`.
2. **Public pages rendered per visit.** `/` and `/help` were `force-dynamic` and the footer information pages called `getCurrentUser()` (cookies), making the whole `[page]` route dynamic. Every visit, crawler included, ran a function (homepage 41 ms/req locally, 3.2 s CPU for the first request after start because the catalogue and route code were loaded).
3. **Crawler exposure.** No `robots.txt` (the request returned the 404 page): bots could crawl `/api/*`, portals, sign-in and sort/view permutations.
4. **Catalogue load per new instance.** 4.5 MB of seed CSV parsed by a character-by-character state machine in every new server instance (the original parser took 112 ms for products and 91 ms for sizes in this process).
5. **Not changed, listed for follow-up:** `/api/auth/me` is called once per page view by the header (about 14 ms locally; anonymous visitors cost no database read); supplier profile pages are `force-dynamic`; `/products` and category listings are the most expensive pages (about 50 ms/req locally, dependent on `searchParams`); the notification bell polls every 60 s for signed-in portal users only and only while the tab is visible; Middleware runs on every request but does nothing unless `MAINTENANCE_MODE` is on.

## What was changed
| Change | Files | Why it lowers CPU |
|---|---|---|
| `prefetch={false}` on every `<Link>` (about 200 files) | `src/components/**`, `src/app/**` | No background invocations per page view; navigation still works (the top loader added earlier shows progress). |
| Homepage `revalidate = 300` instead of `force-dynamic` | `src/app/page.tsx` | Served from the cache, one render per 5 minutes instead of one per visit. Approved supplier products appear after the next rebuild (at most 5 minutes). |
| Help `revalidate = 3600` instead of `force-dynamic` | `src/app/help/page.tsx` | Same. Support e-mail/phone come from the environment at build time; changing them needs a redeploy (as any Vercel env change does). |
| Footer information pages static (`generateStaticParams`, no session) | `src/app/[page]/page.tsx`, `InfoPageView.tsx`, `infoPages.ts` | 17 pages served from the cache. Private CTAs link to the destination; its own guard sends a signed-out visitor to sign-in and back. |
| `src/app/robots.ts` | new | Disallows `/api/`, portals, `/inquiry/`, sign-in/up, password and verification pages, `/forbidden`, `/unauthorized`, `/maintenance`, `?sort=`, `?view=`. Public pages stay crawlable. Not a security control; guards still apply. |
| Faster CSV parse | `src/lib/catalog/csv.ts` | Lines without quotes are split directly; the state machine is used only for quoted lines, and for text with a quoted field spanning lines. Output is identical (unit test `csv-parse-unit-test.mjs`, all four seed files and edge cases): products 112 to 31 ms, sizes 91 to 30 ms in one process. |

## Measurements (local, same workload `docs/performance/tools/cpu-workload.mjs`, 245 requests, server process CPU)
| | Before | After |
|---|---|---|
| Prefetch requests on one homepage view | 16 on load, 69 background after footer scroll | 0 on load, 3 background in total |
| `/products` / `/categories` view | 13 / 16 on load | 0 / 0 on load (1 to 3 background requests) |
| First request after start, homepage | 2.95 s wall, about 3.2 s CPU | 0.18 s (prerendered) |
| Workload CPU | 6172 ms | 5563 ms (one noisy run each; about 10 %) |
| `/` per request | 41 ms | 17.5 ms |
| `/help` per request | 26 ms | 15 ms |
| `/buyer-guide` per request | 18 ms | 14 ms |

Read these carefully: the local workload does not include prefetch traffic and a local `next start` still serves static pages through Node (about 14 ms floor per request on this machine), whereas Vercel serves them from the CDN with no function CPU. The prefetch count is the figure that matters for invocations; the CPU row is only a sanity check and is noisy. **No Vercel CPU improvement is claimed.**

## Checks run
- `tsc --noEmit`, `npm run lint`, production build: clean.
- All 65 `*unit-test.mjs` scripts: 0 failing. `csv-parse-unit-test.mjs` (new) and `footer-pages-check.mjs` (115/115) pass.
- A regression I introduced and fixed: listing the footer slugs in `generateStaticParams` made `/categories` return 500 (`DYNAMIC_SERVER_USAGE`); static params now list only the information pages.
- Not run: authenticated portal sweep after the `prefetch` edit (it changes no behaviour, but the portal pages were not re-clicked), accessibility tooling, any load test, Vercel preview.

## Security and caching notes
No user-specific response was made cacheable: the homepage, Help and the information pages read no session, cookie or account data; `/api/auth/*` and `/api/buyer/*` keep `no-store`/private headers; portal pages stay `force-dynamic`. Rate limiting is unchanged.

## Check in Vercel (Observability and Usage)
1. Observability, Functions, sort by Active CPU: which routes dominate, and invocation counts per route (expect `/api/auth/me`, `/products`, `/categories/[slug]`, `/suppliers/[slug]`, `/` before this change).
2. Requests with the `RSC`/`_rsc` prefetch signature per route; compare before and after deployment.
3. Top user agents, countries and paths by request count (bot traffic); consider Vercel Firewall rate limits or bot protection for the heaviest paths. Do not block search engine crawlers.
4. Cold starts and instance count: each new instance pays the catalogue load once (about 0.4 s here); fewer instances means less of it.
5. Compare Active CPU per day for a week before and after deploying. Not deployed by this change.

## Remaining bottlenecks
`/api/auth/me` per page view; listing pages (`/products`, `/categories/[slug]`, `/suppliers`) are dynamic and the most expensive; supplier profile pages are `force-dynamic`; catalogue indexes are built per instance (`getCatalog`, first listing about 0.15 to 0.5 s); no XML sitemap.
