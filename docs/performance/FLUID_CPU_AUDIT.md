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

---

# Addendum 2026-11-23: unwanted API calls and duplicate server reads

Request from the owner: call an API only when the user asks for something. Evidence below is local (production build, throwaway in-memory MongoDB, MongoDB profiler); **no Vercel invocation or CPU data was available.**

## Confirmed findings (code and measurement)
| # | Finding | Evidence |
|---|---|---|
| 1 | A supplier page ran the account read 3 times and the company read 2 times in one request (layout, guard, page) | profiler: 10 identity operations per supplier page (users 5, auth_sessions 3, supplier_companies 2) where 3 are needed |
| 2 | Buyer/admin pages repeated the account read (buyer dashboard users:2, admin users:4, sessions:2) | profiler |
| 3 | Header, mobile menu and the product-view recorder each called `/api/auth/me`; the header asked again on every client navigation and twice on a normal load (`pageshow` fires on load) | code; `header-session-check.mjs` meCalls |
| 4 | Anonymous visitors triggered `GET /api/buyer/wishlist` and `GET /api/buyer/compare` on every page with product cards (answer is always `authenticated:false`) | `nav-me-calls.mjs`: 2 calls |
| 5 | 60 s polling of unread counts (buyer and supplier bells) and refetch on window focus or tab visibility in 3 bells, 8 list workspaces, the header and the support ticket page | code |
| 6 | Homepage prerender now reads the approved-products list at BUILD time, so a build uses whatever `MONGODB_URI` is set (read only). Local audit builds must set a dead `MONGODB_URI` | observed: a build hung against an unreachable database |

## Changes
| Change | Files | Mechanism |
|---|---|---|
| `getCurrentUser`, `resolveSupplierContext(userId)`, `getAdminPermissions(userId)` wrapped in React `cache()` | `src/lib/auth/session.ts`, `src/lib/supplier/company.ts`, `src/lib/admin/permissions.ts` | One read per request. React `cache` is scoped to a single request render, so another visitor can never receive the value; keyed by account id where an argument exists. Route handlers are not memoized. Authorization is unchanged: the guards still run on every page and API. |
| One shared, 30 s, in-flight-sharing `/api/auth/me` client helper; header, mobile menu and recorder use it; `pageshow` refreshes only on a back/forward restore | `src/lib/client/me.ts`, `HeaderActions.tsx`, `MobileNavigation.tsx`, `RecentlyViewedRecorder.tsx` | One request per tab per 30 s; sign-in/out (`AUTH_EVENT`) forgets it; failures are never remembered. Display hint only: the server still checks the session. |
| Saved-items store skips its list request when the visitor is signed out | `wishlistStore.ts` | The endpoint returns `{authenticated:false}` for them anyway. Signed-in and unknown states still ask. |
| Removed the 60 s polling and every focus/visibility refetch | 3 bells, `HeaderActions`, `BuyerSupportTicketDetails`, 5 list workspaces, 2 saved-items workspaces, `NotificationCenter` | Data now loads on page load and on the user's own actions (filter, page, save, mark read). |

## Measured before and after (local, same pages, same seeded data)
| Signed-in page view (profiler operations) | Before | After |
|---|---|---|
| supplier dashboard / inquiries / quotations / products | 23 / 13 / 14 / 15 | 17 / 7 / 8 / 9 |
| buyer dashboard / inquiries / quotations | 9 / 9 / 7 | 9 / 9 / 7 (buyer already read the account once or twice; unchanged) |
| admin dashboard / inquiries | 14 / 10 | 11 / 7 |
| all nine page views | 114 | 84 (about 26 % fewer database operations) |

| Browser requests | Before (code-derived, not run) | After (measured) |
|---|---|---|
| `/api/auth/me` on one load + 3 client navigations | at least 4 (one per navigation, plus a `pageshow` duplicate) | 1 |
| other API calls for an anonymous visitor on the homepage | 2 (wishlist, compare) | 0 |

Database operations are mostly waiting, not CPU; fewer operations means fewer round trips and less driver and serialization work, which is not a measured Active CPU figure. **No percentage CPU reduction is claimed.**

## Checks
`tsc`, lint, production build (local, dead database URL): clean. All 66 unit scripts pass (new `fluid-cpu-unit-test.mjs`: helper concurrency and freshness, failure not remembered, cache wrappers keyed by account, no force-dynamic public pages, every `<Link>` opts out of prefetch, no `setInterval`, no focus/visibility refetch). `header-session-check.mjs` 5/5. `portal-sweep.mjs`: 86 page loads, 0 issues, 8 of 8 cross-portal refusals (buyer, supplier, admin). One earlier sweep showed the intermittent hydration error #418 on `/supplier/company`; it did not recur in the last sweep and its cause is still unknown.
Not run: a cross-tenant isolation test through two supplier companies, an authenticated load test, Vercel Observability, cache-freshness-after-mutation tests (no new shared cache was added).

## Remaining
- `/products`, category and supplier listing pages (dynamic; about 50 ms per request locally) and supplier profile pages (`force-dynamic`).
- Buyer inquiries issues 7 separate index-covered queries (list, count, summary, two facets, active count); folding the active count into the summary would save one but the statuses need verifying first.
- Each new instance still builds the catalogue index once.
- No index changes are proposed: every operation counted above uses an existing index; no explain plan was run on the throwaway data.

## Rollback
Each change is independent. Revert `src/lib/client/me.ts` and its three callers to restore per-component `/api/auth/me` calls; remove the three `cache()` wrappers to restore per-call reads; the polling and focus listeners are small effects that can be re-added from git history.

## Vercel
Same list as above, plus: compare invocations per route for `/api/auth/me`, `/api/buyer/wishlist`, `/api/buyer/compare`, `/api/*/notifications/unread-count` before and after a deployment of these commits.
