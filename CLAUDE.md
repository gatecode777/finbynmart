# Finbyn Mart — CLAUDE.md

Permanent instruction manual for every Claude Code session on this repository. Read it fully before changing anything. Update it whenever a major architectural or governance decision changes.

## B. Mandatory reading (before designing or implementing ANY page)

1. `/CLAUDE.md` (this file)
2. `/DESIGN.md` — the single source of truth for visual design
3. `/docs/PAGE_TRACKER.md` — page IDs, routes and the three progress statuses
4. The page's own specification in `/docs/page-designs/` (for example `docs/page-designs/01-homepage.md`, `docs/page-designs/02-all-categories.md`) and its design reference in `/docs/design-references/`

Never create or change a page without checking the existing design system. Never invent a new design direction for a single page. The official homepage reference is `docs/design-references/01-homepage-reference.png`; the navy/blue images in `docs/references/` are archived history.

## A. Project identity (verified against the repository, 2026-11-02)

| Item | Value |
|---|---|
| Project | Finbyn Mart — Indian B2B marketplace (supplier discovery, requirements, quotes) |
| Framework | Next.js 15 (`^15.1.7` declared, 15.5.x installed), App Router, Webpack |
| Frontend | React 19, TypeScript 5.7, `src/` layout |
| Database | MongoDB Atlas via the `mongodb` 7.x driver — **only the `users` collection is used**. The product/supplier catalog is read from CSV seed files (`db/seed/`), not from MongoDB |
| Styling | Vanilla CSS + CSS Modules, tokens in `src/styles/variables.css` |
| Icons | Lucide React |
| Fonts | Anton (display) + Montserrat (body/UI) via `next/font/google` |
| Hosting | Intended Vercel; no deployment has been verified |
| Not present | Tailwind, Bootstrap, a component library, ImageKit, Redis, an email or payment service, tests, CI |

The business pivot from consumer fashion ("Finbyn Kart") to B2B ("Finbyn Mart", teal + gold brand) is **confirmed, not a mistake**. Treat any "Finbyn Kart" text or `/finbyn-kart-logo.png` as stale. The old fashion audit data (`docs/site_inventory.json`, `docs/sitemap.xml`, `docs/homepage_raw.html`) and archived references (`docs/references/archive-fashion-concept/`) are historical only. Official logo: `public/images/brand/finbyn-mart-logo.png` — never modify it.

**Multiple tools/sessions may edit this repo concurrently** (this Claude Code session and other AI tools). Re-read a file immediately before editing it, never blind-revert changes that look unfamiliar, prefer small targeted edits over full rewrites. A `next dev` server often owns `.next`: never run `next build` against `.next` while it runs; use `NEXT_DIST_DIR=.next-audit npm run build` (git-ignored) and revert the `tsconfig.json` edit Next makes.

## C. Strict technology rules

- No Tailwind. No Bootstrap. No second CSS framework.
- No UI component libraries, no icon libraries other than Lucide React, no new dependencies without a stated need. (`framer-motion` is installed but unused; do not start using it casually.)
- Lucide React only for icons. Lucide has no brand icons, so the footer social links use hand-drawn outline glyphs in `src/components/layout/Footer/SocialIcon.tsx` (added at the owner's request). No emoji.
- CSS Modules for component styles; global tokens and resets only in `src/styles/`.
- `next/image` for images. Server Components by default; Client Components only for interaction, state or browser APIs.
- Reuse shared components. Follow existing conventions (folder per component, `index.ts` re-export, `Component.module.css`).
- TypeScript strict; no suppressed errors.
- **No fake data presented as real, no fake success.** Sample content is allowed for visual development but must be flagged in a code comment and listed in `docs/MISSING_ASSETS.md`. Never invent backend endpoints. The requirement and inquiry forms intentionally show an honest "not connected" message until a real backend exists (`src/lib/api/*`).

## D. Design consistency

Every page uses the Finbyn Mart design system in `DESIGN.md`. Never independently change brand colors, fonts, the type scale, button/card/form styles, radii, shadows, spacing, navigation appearance, breakpoints or animation. Primary Teal is **#04534F** (`--primary`); gold **#FDB304** is a selective accent. If a page needs a new component, extend the shared system instead of creating an unrelated style. Never hard-code a hex that has a token.

`src/app/layout.tsx` renders `AnnouncementBar` → `MainHeader` → `CategoryNavigation` → `{children}` → `Footer` **once, globally**. Never build a second header or footer; if a page needs different chrome, raise it as a decision.

## E. Component reuse

Shared layout: `src/components/layout/` (`AnnouncementBar` = top utility bar, `MainHeader`, `SearchBar`, `CategoryNavigation`, `MobileNavigation`, `Footer`). Shared UI: `src/components/ui/` (`Button`, `IconButton`, `Badge`, `Input`, `Select`, `Container` = page container, `SectionHeading`, `Breadcrumb`, `Pagination`, `EmptyState`, `FilterBar`, `FilterDrawer`, `ScrollSlider`, `MediaTile`, `PageIntro`, `PageBody`, `ResultGrid`, `ResultSummary`, `TileLinkCard`). Domain components: `homepage/`, `category/`, `product/`, `supplier/`, `account/`.

`DESIGN.md` section 6 lists which standard components exist, which are duplicated (supplier card), and which are missing (Textarea, Modal, Dropdown, LoadingState, ErrorState, Toast, ConfirmationDialog). Do not create a second version of an existing component; build missing ones as shared components, not page-local.

## F. Functional requirements

Every interactive element must work: buttons act, search submits and returns relevant results, filters filter, forms validate and submit (or honestly report they are not connected), pagination changes data, dropdowns/modals open and close, links navigate, save/wishlist persist, authentication protects restricted pages. No decorative buttons. No fake success notifications.

## G. Responsive requirements

Every page must work at 320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920 and 2560px, in portrait and landscape, and at browser zoom 80/90/100/110/125/150/200%. No horizontal overflow, clipped text, overlap, broken grids, squeezed cards, inaccessible mobile controls or fixed-width layouts. Tables need a responsive strategy. Mobile is designed, not a shrunken desktop. Use Grid/Flexbox/`clamp()`/`minmax()`; grid tracks holding inputs or text use `minmax(0, 1fr)`.

Test with the scripts in `docs/responsive/tools/` (need `npm i puppeteer-core` and a running `next start`). Report only what was actually run, and state that Firefox, Safari and real devices are untested unless they were.

## H. Accessibility

Semantic HTML, keyboard navigation, visible focus, accessible labels, contrast of at least 4.5:1, meaningful alt text, accessible dialogs and menus (focus trap, Escape, focus return, `inert` when closed), reduced-motion support.

## I. Performance

`next/image` with correct `sizes`; lazy-load below the fold; avoid unnecessary client components and JavaScript; prevent layout shift; efficient data fetching; **never load the whole 21,392-product catalog per request when a count or small query will do**; add `loading.tsx`/`error.tsx` boundaries for pages with async data. Targets once measurable: Lighthouse 90/95/95/95, LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.

## J. Security

Protect dashboard routes; enforce authorization on the server and never trust client-side role checks alone; validate all input on the server; prevent access to other users' records; rate-limit auth and form endpoints; never expose or commit secrets (`.env.local` is git-ignored; never print credentials); protect buyer and supplier data. Known open items are in `docs/audit/11_SECURITY_AUDIT.md` (no rate limiting, no role enforcement yet, no security headers).

## K. Page completion policy

Each page has three separate statuses (tracked in `docs/PAGE_TRACKER.md`):

- **Design**: Not Started → Reference Received → In Progress → Complete
- **Development**: Not Started → In Progress → Implemented → Functionally Verified
- **QA**: Not Started → In Progress → Responsive Verified → QA Complete

(The tracker table uses the compact set Not Started / Reference Received / In Progress / Complete.)

DESIGN COMPLETE only after: the design reference is finalized, the detailed implementation prompt is prepared and delivered, the design matches `DESIGN.md`, the page spec is documented, and the tracker is updated. FUNCTIONALLY VERIFIED only after real interactions, data flows and API integrations were tested. QA COMPLETE only after responsive, accessibility, functional and visual checks pass. Never mark a page complete because code was generated.

## Standing instructions from the owner

1. **Build the backend together with the pages.** When a page prompt (PRD) says data must be saved, authenticated or protected (requirements, inquiries and quotes, wishlist, accounts, dashboards), build that backend in the same piece of work: MongoDB collections with indexes, API route handlers under `src/app/api/`, server-side validation and authorization, rate limiting, and the UI wired to it. Do not leave a form that only validates. Never show a success message that the backend did not produce. Do the backend after the page it serves is complete, in page order (Pages 01–04 first). Test against a throwaway database (`MONGODB_DB=<name>_test`), never the live collections, and drop it afterwards.
2. **If a page already exists, modify it; do not rebuild it.** When a page (or its components) is already in the repo, change it only as far as needed to match the new UI reference and PRD: keep the working data flow, routes, tests and shared components, and reuse or extend them. Rebuilding from scratch needs an explicit reason written in the page report.
3. **One shared view per page family.** Pages that differ only in data (category and subcategory pages) must use the same component (`CategoryListingPage`), not copies.
4. **No loading boundary above a page that can 404 or redirect.** A `loading.tsx` makes Next stream a 200 before `notFound()`/`redirect()` runs (a soft 404). Only add one where the page cannot return those.

## Page workflow

1. Identify the page ID and route in the tracker. 2. Read CLAUDE.md, DESIGN.md, the tracker. 3. Inspect related pages and reusable components. 4. Study the design reference. 5. Write the page spec in `docs/page-designs/`. 6. Prepare the implementation prompt. 7. Check consistency with DESIGN.md. 8. Update the tracker. 9. Mark Design Complete only after the spec and prompt are delivered and approved. 10. Implement and test only when implementation is requested. If a request is only to prepare a design and prompt, do not start coding.

If additional pages are discovered, document why, assign a new ID, update the total and keep existing IDs. Document route aliases instead of counting them as pages.

## Project state and data rules

- **Routes and status**: see `docs/PAGE_TRACKER.md`; the evidence-based audit is `docs/FINBYN_COMPLETE_PROJECT_AUDIT.md` with detail in `docs/audit/`; responsive work in `docs/responsive/`.
- **Accounts are real**: sign-in, sign-up and supplier registration use MongoDB (`MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET` in git-ignored `.env.local`; `.env.example` has placeholders). Code in `src/lib/auth`, `src/lib/db`, `src/app/api/auth`. Never commit credentials.
- **Catalog**: `db/schema.sql` + `npm run catalog:build` assign 21,392 research-dataset products to 1,200 fictional sellers and write `db/seed/*.csv` (committed) and `db/catalog.sqlite` (git-ignored). Pages read it through `src/lib/catalog/` (server-only; `data.ts` is the single file to replace if the catalog moves to a hosted database). Data is test/research data with estimated prices; sellers are never shown as verified; never display seller contact fields. Raw source files in `public/` are web-served and must move out before deploying. See "Catalog database" in `docs/MISSING_ASSETS.md`.
- **Sample data**: everything flagged in `docs/MISSING_ASSETS.md` (stats, testimonials, supplier records, contact details, footer social URLs) is placeholder, never confirmed business fact.
- **Two category sources coexist**: `src/lib/constants/categories.ts` / `categoryPages.ts` (curated sample categories) and the catalog categories in `db/seed/categories.csv`. `/categories` reads both through the single directory service `src/lib/catalog/categories.ts` (`getCategoryDirectory()`); use it for any category discovery rather than adding a third source. See `docs/page-designs/02-all-categories.md`.
- **Category routes**: `/categories` (Page 02), `/categories/[slug]` (Page 03), `/categories/[slug]/[subcategory]` (Page 04). `/category/[slug]` is only a legacy redirect. Pages 03 and 04 render through `CategoryListingPage` and `src/lib/catalog/categoryListing.ts`; the URL carries every filter (`listingQuery.ts` is the client-safe half).
- **Product listing engine**: `src/lib/catalog/categoryListing.ts` is the single engine for every product list (`getProductListing` for all products and search, `getCategoryListing` for category pages) and `GET /api/public/products` (`publicProduct.ts`, `publicProductQuery.ts`). Search, filters, facets, sort and pagination live there; extend it, do not write a second one (Page 07 search results and the supplier product list must use it). `/products` (Page 05) renders through `CategoryListingPage` with `PageHero` and `SearchPanel`.
- **Layout rule**: a page wraps its breadcrumb and `PageBody` in one `Container`; `PageBody` does not add another (a second one doubled the side padding). GET filter forms use `next/form` and are keyed by the URL so they navigate without a full reload and reset to the server state.
- **Backend and API**: `docs/backend/` (`BACKEND_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_REFERENCE.md`) describes what exists. User data is in MongoDB (`users`, `requirements`, `inquiries`, `wishlists`, `rate_limits`); the catalog stays read-only CSV. Writes follow one pipeline: session → `readSmallJson`/`clean` validation → server-side product/supplier resolution (`src/lib/catalog/productRef.ts`) → `rateLimit` → service. API responses are `{ ok, message, fields }`. Roles are **not** enforced yet. Extend these services instead of adding parallel ones.
- **Support module (Page 36)**: `src/lib/support/` — `ticketRules.ts` (client-safe: categories, related types, the eight statuses, the one status → card-group mapping, transition table for a future support side, reference pattern, query parser), `ticketService.ts` (`support_tickets` collection and indexes, create/list/summary/detail/attachment read), `faq.ts` (repo-managed, `published` flag, how-to answers only), `channels.ts` (env-driven). `rules.ts` is the older Contact Us form; its `FBM-SUP-XXXXXXXX` references differ from tickets' `FBM-SUP-YYYYMM-XXXXXX`. Rules: a buyer never sets status, priority, agent, owner or reference (the server refuses those fields); creation needs a per-form `idempotencyKey` (unique per buyer) and is rate limited to 10/hour; related records are ownership-checked on the server (inquiry, quotation that is not a draft, order, catalogue product — no invoice or payment, they do not exist); attachments are checked by content, stored privately with random names and downloaded only by the owner; foreign, unknown and malformed ticket references give one identical 404. **Never state that support was notified, that someone will reply, a response time, an e-mail, a phone number or "Online"** unless it is real: there is no support side, no replies and no chat yet (Page 37 and a staff side are BLOCKED). Optional env: `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_HOURS`, `SUPPORT_ATTACH_MAX_FILES`, `SUPPORT_ATTACH_MAX_MB`. The notification category `support` is always on. New FAQ answers must not state any payment, delivery, return, fee or timing policy. Docs: `docs/backend/PAGE_36_*.md`. **Ticket conversation (Page 37)**: `conversationRules.ts` (client-safe: reply/reopen/feedback validation, what each status allows, the ordering key and cursors, tab keys), `conversationService.ts` (`support_messages`; overview with server-calculated `capabilities`, paged conversation, buyer reply, merged timeline, files, download), `ticketActions.ts` (reopen, feedback), `relatedDetails.ts` (live, ownership-checked), `uploadRequest.ts` (the one multipart reader). Rules: every query is by (reference AND session buyer) then by the ticket's id; buyer queries always add `visibility: "buyer"`; sender, role, status and visibility are server-assigned (any such field in a body is refused); reopening is the only status change a buyer makes (resolved/closed, within 30 days, at most 3 times, reason required, checked with `canTransition`); one feedback per ticket (unique index); lists are cursor-paged (20, max 50) by the shared ordering key; an equality lookup must use a partial index whose filter MongoDB can prove (`$exists`, not `$type`); there is no support side, so support messages are only ever inserted by tests: **never fabricate a support reply, a "seen" label, a notification or an agent**. Constants like tab keys that a server page needs live in the rules file, never exported from a client component. Docs: `docs/backend/PAGE_37_*.md`.
- **Page numbers**: the owner's page PRDs use their own numbering (Page 05 All Products, 06 Product Details, 07 Product Search Results, 08 Supplier Listing, 09 Supplier Profile). The tracker keeps its approved IDs; the crosswalk is in `docs/PAGE_TRACKER.md`. Doc file names follow the PRD number. The tracker is now edited by hand (the script that generated it is retired).
- **Tests**: no unit-test framework or CI. Browser and API checks are scripts in `docs/page-reports/tools/` (need `puppeteer-core` and a local Chrome), run against `next start` of a build in `.next-audit` on port 3100 with `MONGODB_DB=<name>_test` (`build-and-serve-test.sh`), then drop that database with `drop-test-db.mjs`. Revert the `tsconfig.json` edit Next makes after a build. Responsive audit: `docs/responsive/tools/audit.mjs` (`ROUTES` env limits the routes).

## Quality bar

`npm run lint`, `npx tsc --noEmit` and a production build must pass before calling anything done; no console errors. Never mark a feature complete until it works against real data/backend — say when sample data is used. Do not fabricate Lighthouse or accessibility scores; run real tooling or say it was not run.

## API performance rules (permanent)

- Measure before and after with `docs/performance/tools/bench.mjs` on a production build with nothing else running; never claim an improvement without both numbers, and report what did not improve. Reports live in `docs/performance/`.
- Targets (p95): simple read < 300 ms, detail < 350, paginated listing < 400, filtered or search < 500, write < 500, aggregation < 800. State plainly where a route misses them (see `docs/performance/API_OPTIMIZATION_SUMMARY.md`).
- Every list endpoint is paginated with a maximum page size (50); never return an unbounded list. Return only the fields the UI needs (allow-listed DTOs), never whole documents.
- Every MongoDB query must use an index (`explain` shows no COLLSCAN or blocking sort); add the index with the feature. Reuse the one shared client (`src/lib/db/mongo.ts`).
- Cache only public, read-only data, with a short TTL, single-flight loading and an explicit invalidation path; never cache personal data. `FINBYN_PUBLIC_CACHE_MS=0` switches caches off (the functional test server uses it).
- Do not load the whole catalogue per request; use the listing engine's index and its result cache.
- Do not run load tests against production or live collections; use the throwaway database.
