# Finbyn Mart — B2B Marketplace Redesign

Finbyn Mart is relaunching as a B2B marketplace (supplier discovery, requirements, quotes — IndiaMART/TradeIndia style), not the consumer fashion storefront the live site currently runs. **This is a confirmed business pivot, not a mistake** — see "History" below.

Read this file before making changes. Update it whenever a major architectural decision changes.

## Current status

Implemented routes: homepage, `/category/[slug]` (+ `/categories` and `/categories/[slug]` redirects), `/products` and `/products/[slug]`, `/suppliers` and `/suppliers/[slug]`, `/search`, `/industries` and `/industries/[slug]`, `/post-requirement`, `/sign-in`, `/register-supplier`, `/how-it-works`, `/sitemap`. Footer/legal/info pages without real content render an honest placeholder via `src/app/[page]/page.tsx`. Accounts (sign-in, sign-up, supplier registration) are real: MongoDB via `MONGODB_URI` in git-ignored `.env.local`, code in `src/lib/auth` and `src/app/api/auth`. Never commit credentials. The requirement and inquiry forms still validate but have no backend (`src/lib/api/*` stubs return an honest "not connected" result). See `docs/MISSING_ASSETS.md` for every placeholder/sample value still in the codebase and what needs to replace it before launch.

**Multiple tools/sessions may be editing this repo concurrently** (this Claude Code session plus other AI coding tools working the same project). Re-read a file immediately before editing it rather than trusting an earlier read, don't blind-revert changes that look unfamiliar, and prefer small targeted edits over full-file rewrites to reduce collision risk.

## History (read before assuming anything about scope)

An earlier session scoped this repo as a **consumer fashion** redesign (navy/white editorial "Fashion Plus" look), matching what `docs/site_inventory.json` / `docs/sitemap.xml` / `docs/homepage_raw.html` show about the *current live* finbynkart.com (jeans, kurtis, dresses, `/cart`, `/my-wishlist`). Those fashion reference screenshots are archived at `docs/references/archive-fashion-concept/` — not deleted, but no longer the design direction.

The business then pivoted to B2B, first under a navy/blue "Finbyn Kart" identity. That identity was then superseded by the current **"Finbyn Mart" teal + gold brand** (official logo: teal storefront mark + gold awning, "Powering Digital Commerce" tagline, at `public/images/brand/finbyn-mart-logo.png`). Every in-app brand reference (site title, footer, metadata, aria-labels) has been renamed to "Finbyn Mart" — treat any "Finbyn Kart" text or `/finbyn-kart-logo.png` reference you encounter as stale and fix it back. **The old fashion-retail audit data and the navy/blue "Finbyn Kart" reference are now historical context only.**

## Non-negotiable tech rules

- Next.js App Router + TypeScript, `src/` layout.
- Vanilla CSS + CSS Modules only. **No Tailwind, ever.**
- Icons: **Lucide React exclusively** — no emoji, no other icon libraries, no brand/social logos (Lucide dropped brand icons; social links render as text, not glyphs).
- Fonts: Poppins (body/UI) + Playfair Display (headings), via `next/font/google`, wired in `src/app/layout.tsx`.
- `next/image` for all images.
- Server Components by default; Client Components only where interaction/state/browser APIs require it (search input, mobile nav drawer, requirement form).
- No fake data shipped as if real. Sample/placeholder content is allowed for visual development (the spec itself does this with example supplier names), but must be clearly flagged in a code comment and tracked in `docs/MISSING_ASSETS.md` — never presented as confirmed business fact (stats, testimonials, contact info, verification badges).
- Never invent backend endpoints. Never fake a successful form submission when there's no real backend behind it.

## Design tokens — Teal + Gold Edition (official, replaces any earlier navy/blue system)

Defined in `src/styles/variables.css`, imported via `src/app/globals.css`. This is the **official Finbyn Mart brand system** — the logo is the single source of truth for brand identity. Never use blue/navy as the primary brand theme, and never use purple, pink or neon gradients.

| Token | Hex | Usage |
|---|---|---|
| `--primary` | `#04534f` | Primary teal — main brand color |
| `--primary-dark` | `#033f3c` | Header/footer dark teal |
| `--primary-deep` | `#023330` | Deepest backgrounds (same value as `--navy`) |
| `--navy-secondary` | `#056263` | Secondary teal elements |
| `--primary-bright` | `#05777c` | Bright teal — interactive elements |
| `--accent` | `#fdb304` | Golden yellow — primary accent / CTA |
| `--accent-hover` | `#eaa300` | Gold hover state |
| `--accent-light` | `#fce29e` | Light gold — soft highlights |
| `--accent-soft` | `#fff7e5` | Soft cream — highlight backgrounds |
| `--primary-light` / `--surface-blue` | `#eaf5f3` | Light mint — section backgrounds (both names hold the same mint value; `--surface-blue` is a legacy name, not a color bug) |
| `--background-soft` | `#f6f8f7` | Soft grey — alternate backgrounds |
| `--text-primary` | `#183a38` | Main text |
| `--text-secondary` | `#526563` | Supporting text |
| `--text-muted` | `#6a6c6c` | Metadata |
| `--border` / `--border-strong` | `#dce8e5` / `#c3d3d0` | Borders |

Gold is an accent used selectively (CTAs, highlights) — teal stays dominant. `--success`/`--warning`/`--danger` are semantic status colors, not brand colors — never repurpose them for brand theming. 4px spacing scale (`--space-1` through `--space-24`). Small/professional border radii (`--radius-xs` 4px through `--radius-xl` 16px). Fluid type scale via `clamp()`. Don't introduce new colors or a second spacing system in individual components — extend `variables.css` instead. This token set applies to every route: homepage, category listing, product detail, and the planned supplier listing/profile pages.

## Shared layout — reuse, never duplicate

`src/app/layout.tsx` renders `AnnouncementBar` → `MainHeader` → `CategoryNavigation` → `{children}` → `Footer` **once, globally**. Every route (homepage, category listing, product detail, etc.) inherits the same header/footer/nav automatically. Do not create a second header or footer for a new page — if a page needs something different in that chrome, that's a decision to raise, not to silently duplicate.

Shared layout components live in `src/components/layout/`:
- `AnnouncementBar`, `MainHeader`, `SearchBar`, `CategoryNavigation`, `MobileNavigation`, `Footer`

Homepage-only sections live in `src/components/homepage/` (one folder per section: `HeroSection`, `TrustBenefits`, `CategoryShowcase`, `RequirementBanner` + `RequirementForm`, `FeaturedSuppliers` + `SupplierCard`, `HowItWorks`, `IndiaNetworkBanner`, `IndustrySolutions`, `Testimonials`, `AppPromotion`).

Shared UI primitives live in `src/components/ui/`: `Button`, `IconButton`, `Badge`, `Input`, `Select`, `Container`, `SectionHeading`, `MediaTile` (icon/tint placeholder that upgrades to a real photo the moment `imageSrc` is supplied — see `docs/MISSING_ASSETS.md`). `Skeleton`/`Toast` were deliberately not built yet — nothing consumes them until a page has real async loading or global notifications.

Data/types: `src/types/index.ts` (interfaces), `src/lib/constants/` (navigation, categories, suppliers, industries, process steps, trust stats, footer links — all placeholder/sample, flagged), `src/lib/validations/` (form validation), `src/lib/api/` (stub API calls that return an honest "not connected" result rather than fake success).

When building the category listing page (or any future page), reuse these — don't fork new header/footer/token/component variants.

## Catalog database

`db/schema.sql` defines sellers → products → product_sizes (plus categories) in portable SQL; `npm run catalog:build` assigns the 21,392 products in `public/real_clothing_products.csv` to the sellers in `public/sellers.csv`, writes `db/seed/*.csv`, and builds `db/catalog.sqlite` (git-ignored, rebuildable). It is test/research data with estimated prices and fictional sellers. Pages read it through `src/lib/catalog/` (server-only; loads `db/seed/*.csv` into memory — `data.ts` is the one file to replace if the catalog moves to a hosted DB). Catalog sellers are never shown as verified and have no logos (initials placeholder only); never display seller contact fields. See "Catalog database" in `docs/MISSING_ASSETS.md` before using any of it.

## Responsive requirements

No horizontal scroll, no overlap, no clipped headings, no stretched images from 320px to 2560px, and at 80–125% browser zoom. Build mobile as its own layout. Use CSS Grid/Flexbox/`clamp()`/`minmax()`, not fixed widths.

## Known gaps (tracked in docs/MISSING_ASSETS.md)

Real photography, real supplier/testimonial/contact data, real marketplace stats, search/requirement-form backend wiring, and a real India map asset are all still placeholders. A full QA doc suite (visual comparison, accessibility audit, Lighthouse performance report) was requested in the original brief but needs real browser/Lighthouse tooling this environment doesn't have — don't fabricate scores for those docs; run them with real tooling when available.

## Quality bar

- `npm run lint`, `npx tsc --noEmit`, and `npm run build` must all pass clean before calling anything done — no suppressed TypeScript errors, no console errors.
- Lighthouse targets (once measurable): Performance 90+, Accessibility 95+, Best Practices 95+, SEO 95+. Core Web Vitals: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- Never mark a feature complete until it's implemented and tested against real data/backend — sample data is fine during build, but say so.
