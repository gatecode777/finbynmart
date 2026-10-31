# Finbyn Kart — B2B Marketplace Redesign

Finbyn Kart is relaunching as a B2B marketplace (supplier discovery, requirements, quotes — IndiaMART/TradeIndia style), not the consumer fashion storefront the live site currently runs. **This is a confirmed business pivot, not a mistake** — see "History" below.

Read this file before making changes. Update it whenever a major architectural decision changes.

## Current status

Homepage is implemented and verified (`npm run lint`, `npx tsc --noEmit`, `npm run build` all pass; dev server confirmed all sections render). Category listing page (`/category/[slug]`) is the active next phase. See `docs/MISSING_ASSETS.md` for every placeholder/sample value still in the codebase and what needs to replace it before launch.

## History (read before assuming anything about scope)

An earlier session scoped this repo as a **consumer fashion** redesign (navy/white editorial "Fashion Plus" look), matching what `docs/site_inventory.json` / `docs/sitemap.xml` / `docs/homepage_raw.html` show about the *current live* finbynkart.com (jeans, kurtis, dresses, `/cart`, `/my-wishlist`). Those fashion reference screenshots are archived at `docs/references/archive-fashion-concept/` — not deleted, but no longer the design direction.

The business then pivoted to B2B. The current reference is `docs/references/b2b-homepage-reference.png` (an IndiaMART-style layout with Finbyn Kart branding). **The old fashion-retail audit data is now historical context only** — useful for knowing what the live site currently does, not for what we're building.

## Non-negotiable tech rules

- Next.js App Router + TypeScript, `src/` layout.
- Vanilla CSS + CSS Modules only. **No Tailwind, ever.**
- Icons: **Lucide React exclusively** — no emoji, no other icon libraries, no brand/social logos (Lucide dropped brand icons; social links render as text, not glyphs).
- Fonts: Inter (body/UI) + Manrope (headings), via `next/font/google`, wired in `src/app/layout.tsx`.
- `next/image` for all images.
- Server Components by default; Client Components only where interaction/state/browser APIs require it (search input, mobile nav drawer, requirement form).
- No fake data shipped as if real. Sample/placeholder content is allowed for visual development (the spec itself does this with example supplier names), but must be clearly flagged in a code comment and tracked in `docs/MISSING_ASSETS.md` — never presented as confirmed business fact (stats, testimonials, contact info, verification badges).
- Never invent backend endpoints. Never fake a successful form submission when there's no real backend behind it.

## Design tokens

Defined in `src/styles/variables.css`, imported via `src/app/globals.css`. Primary palette: navy (`--navy #071f45`, `--navy-secondary #0b2c58`), primary blue (`--primary #0647a8`), white/soft blue-gray surfaces (`--background-soft #f5f8fc`, `--surface-blue #eaf3ff`). 4px spacing scale (`--space-1` through `--space-24`). Small/professional border radii (`--radius-xs` 4px through `--radius-xl` 16px). Fluid type scale via `clamp()`. Don't introduce new colors or a second spacing system in individual components — extend `variables.css` instead.

## Shared layout — reuse, never duplicate

`src/app/layout.tsx` renders `AnnouncementBar` → `MainHeader` → `CategoryNavigation` → `{children}` → `Footer` **once, globally**. Every route (homepage, category listing, product detail, etc.) inherits the same header/footer/nav automatically. Do not create a second header or footer for a new page — if a page needs something different in that chrome, that's a decision to raise, not to silently duplicate.

Shared layout components live in `src/components/layout/`:
- `AnnouncementBar`, `MainHeader`, `SearchBar`, `CategoryNavigation`, `MobileNavigation`, `Footer`

Homepage-only sections live in `src/components/homepage/` (one folder per section: `HeroSection`, `TrustBenefits`, `CategoryShowcase`, `RequirementBanner` + `RequirementForm`, `FeaturedSuppliers` + `SupplierCard`, `HowItWorks`, `IndiaNetworkBanner`, `IndustrySolutions`, `Testimonials`, `AppPromotion`).

Shared UI primitives live in `src/components/ui/`: `Button`, `IconButton`, `Badge`, `Input`, `Select`, `Container`, `SectionHeading`, `MediaTile` (icon/tint placeholder that upgrades to a real photo the moment `imageSrc` is supplied — see `docs/MISSING_ASSETS.md`). `Skeleton`/`Toast` were deliberately not built yet — nothing consumes them until a page has real async loading or global notifications.

Data/types: `src/types/index.ts` (interfaces), `src/lib/constants/` (navigation, categories, suppliers, industries, process steps, trust stats, footer links — all placeholder/sample, flagged), `src/lib/validations/` (form validation), `src/lib/api/` (stub API calls that return an honest "not connected" result rather than fake success).

When building the category listing page (or any future page), reuse these — don't fork new header/footer/token/component variants.

## Responsive requirements

No horizontal scroll, no overlap, no clipped headings, no stretched images from 320px to 2560px, and at 80–125% browser zoom. Build mobile as its own layout. Use CSS Grid/Flexbox/`clamp()`/`minmax()`, not fixed widths.

## Known gaps (tracked in docs/MISSING_ASSETS.md)

Real photography, real supplier/testimonial/contact data, real marketplace stats, search/requirement-form backend wiring, and a real India map asset are all still placeholders. A full QA doc suite (visual comparison, accessibility audit, Lighthouse performance report) was requested in the original brief but needs real browser/Lighthouse tooling this environment doesn't have — don't fabricate scores for those docs; run them with real tooling when available.

## Quality bar

- `npm run lint`, `npx tsc --noEmit`, and `npm run build` must all pass clean before calling anything done — no suppressed TypeScript errors, no console errors.
- Lighthouse targets (once measurable): Performance 90+, Accessibility 95+, Best Practices 95+, SEO 95+. Core Web Vitals: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- Never mark a feature complete until it's implemented and tested against real data/backend — sample data is fine during build, but say so.
