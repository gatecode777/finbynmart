# Page 01 — Homepage (`/`)

Tracker status: Design **Reference Received**, Prompt **Not Started**, Development **Not Started** (owner baseline; code already exists), QA **Not Started**. This spec documents the approved design and the current implementation so future pages stay consistent. It does not change the homepage.

## Objective

Introduce Finbyn Mart as a trusted Indian B2B marketplace and get a visitor into one of three actions within seconds: search for a product or supplier, post a requirement, or browse categories, products and suppliers.

## Reference

`docs/design-references/01-homepage-reference.png` (1024×1536, teal + gold). It is the visual source for the entire site. Notes on how the reference and the build differ, all deliberate:

- The reference photo shows the two professionals in front of a factory interior; the project's licensed asset (`/images/hero/hero-professionals.png`) has them on a balcony. A factory-background photo is still needed.
- The reference's Featured Suppliers use lookalike brand logos and its Featured Products use sample prices; the build uses project sample records and flags them in `docs/MISSING_ASSETS.md`.
- The reference does not draw a "marketplace trust and statistics" band; the brief lists it as section 11 and the build keeps it (`IndiaNetworkBanner`, three value cards plus a stats strip).
- The old navy "Take Finbyn Kart on the Go" app promotion is not part of the teal design and was removed from the page (the `AppPromotion` folder remains unused).

## Layout and section order (do not omit or reorder without an approved usability reason)

Global chrome (rendered by `src/app/layout.tsx`, shared by every page):

| # | Section | Component | Summary |
|---|---|---|---|
| 1 | Global utility bar | `layout/AnnouncementBar` | 36px `--navy` bar. Left: "India's Trusted B2B Marketplace" plus claims (claims appear from 1100px). Right: Track Inquiry, Help, Contact Us. |
| 2 | Main header | `layout/MainHeader`, `SearchBar`, `AccountLink` | Logo, search (type select + input + teal button), gold "Get Best Price / Post Your Requirement", Sign In / Join Free (account state from `/api/auth/me`), For Suppliers. Two-row on phones/tablets. |
| 3 | Category navigation | `layout/CategoryNavigation` | Dark-teal bar, 40px, ≥1024px. Nine entries; two lower-priority entries show from 1400px. |

Page body (`src/app/page.tsx`, in this order):

| # | Section | Component | Content and behaviour |
|---|---|---|---|
| 4 | Hero | `homepage/HeroSection`, `HeroSearch`, `PopularSearches` | Eyebrow "India's Trusted B2B Marketplace"; Anton heading "Find Reliable Suppliers" (teal) / "For Your Business" (gold); paragraph; large search; popular-search chips; arc-framed photo bleeding to the right edge on ≥992px; four stat cards (`HERO_STATS`: 10L+ Verified Suppliers, 50L+ Product Listings, All India Supplier Network, Secure & Safe Business Inquiries — **placeholder figures**). |
| 5 | Marketplace benefits | `homepage/TrustBenefits` | Floating card overlapping the hero: Verified Suppliers, Best Price, Wide Range, Easy Inquiries (`TRUST_BENEFITS`). |
| 6 | Discover Top Categories | `homepage/CategoryShowcase` | Section heading + "View All Categories" → `/categories`; ten image-overlay cards from `TOP_CATEGORIES` linking to `/categories/<slug>` (redirects to `/category/<slug>`). |
| 7 | Get Best Quotes from Verified Suppliers | `homepage/RequirementBanner`, `RequirementForm` | Mint panel: icon, eyebrow, Anton title, three benefit chips, form (product/service, quantity, city, gold-or-teal submit). Validates; submission is **not connected** and says so. |
| 8 | Featured Products | `homepage/FeaturedProducts`, `ui/ScrollSlider`, `category/ProductCard` | Five sample products in a scroll-snap slider with arrows; each links to `/products/<slug>`. |
| 9 | Featured Suppliers | `homepage/FeaturedSuppliers`, `ui/ScrollSlider`, `SupplierCard` | Six sample suppliers; cards link to `/suppliers/<slug>`. |
| 10 | How Finbyn Mart Works | `homepage/HowItWorks` | Four steps from `HOW_IT_WORKS` with numbered gold badges; horizontal on desktop, stacked on phones. |
| 11 | Marketplace trust and statistics | `homepage/IndiaNetworkBanner` | Three value cards (All India Supplier Network, Safe & Secure Inquiries, Grow Your Business) and a dark-teal stats strip (`NETWORK_STATS` — **placeholder figures**). |
| 12 | Industry Solutions | `homepage/IndustrySolutions` | Eight image-overlay cards from `INDUSTRY_SOLUTIONS` → `/industries/<slug>`. |
| 13 | Customer Testimonials | `homepage/Testimonials` | Three **sample** quotes (labelled "Sample quotes shown for layout only"), gold-ruled cards with a quote badge and an avatar slot (`avatarSrc` supported for real, consented photos). |
| 14 | Footer | `layout/Footer` | Logo, description, social icon buttons, six link columns, "contact details to be confirmed" note, legal links. |

## Typography and color

Anton uppercase for the hero heading and every section title (section titles `clamp(2rem, 1.5rem + 2vw, 3.25rem)`, hero `clamp(2.25rem, 1.2rem + 3.1vw, 4rem)`); two-tone treatment with Bright Teal or Gold on the key words. Montserrat for everything else. Primary Teal #04534F for headings and primary buttons; Dark Teal #033F3C for the nav bar; Deep Teal #023330 for the utility bar, scrims and section titles; Gold #FDB304 for the header CTA, hero highlight words, the photo arc and stars; Mint #EAF5F3 and Soft Grey #F6F8F7 for section bands. Full token table in `DESIGN.md`.

## Responsive design

| Width | Behaviour |
|---|---|
| Phone <640 | Two-row header; photo, then text, search and chips; stat cards 2×2; benefits 2×2 with icon above text; categories 2 columns (label and arrow scale with the card); requirement form single column; products and suppliers in sliders with a peek; industries 2 columns; footer 2 columns. |
| Tablet 640–1023 | Header still two rows; categories 3 columns; benefits 2×2 then 4; sliders show 2–3 cards; industries 4 columns. |
| Laptop 1024–1399 | One-row header (action subtitles hidden below 1280); nav trimmed to seven entries; hero two-column with photo arc; categories 5 columns. |
| Desktop ≥1400 | Full nav (nine entries); four slider cards; container maxes at 1440px minus padding. |

## Interactive behaviour

Header and hero search submit to `/search?type=…&q=…`; account link reflects session; mobile menu (focus trap, Escape, overlay); sliders scroll with arrows and touch; category, product, supplier and industry cards navigate; requirement form validates and reports "not connected"; footer links resolve (some to "not published yet" placeholders); social links open generic root domains (to be replaced).

## Data requirements

Static sample constants today: `src/lib/constants/categories.ts`, `featuredProducts.ts` (via `categoryPages.ts`), `suppliers.ts`, `industries.ts`, `process.ts`, `trust.ts`, `testimonials.ts`, `footer.ts`, `navigation.ts`. Target: categories, featured products and suppliers from the catalog service; stats, testimonials and contact details from approved business data. Everything sample is listed in `docs/MISSING_ASSETS.md`.

## States

- Loading: none needed while data is static; add `loading.tsx` when data becomes async.
- Empty: sliders hide nothing; if featured data is empty the section should not render (not implemented yet).
- Error: no app-level `error.tsx` exists (listed gap).

## Accessibility

Landmarks and skip link; each section has `aria-labelledby` or `aria-label`; sliders are focusable regions with labelled arrow buttons; decorative images have empty alt; menu and drawers manage focus; reduced-motion respected. Not yet audited with axe or Lighthouse.

## Acceptance criteria

1. Section order matches the list above; no section omitted.
2. Colors, fonts and tokens come from `DESIGN.md`; no new hex values.
3. No horizontal overflow at 320–3440px (verified by `docs/responsive/tools/audit.mjs`).
4. Every control works or honestly reports it is not connected.
5. Sample content is flagged in code and `docs/MISSING_ASSETS.md`.
6. Header and footer are the shared components.
7. `npm run lint`, `npx tsc --noEmit` and a production build pass.

Open items: factory-background hero photo, real stats, real testimonials with consent, real social URLs and contact details, Lighthouse/axe runs, `loading.tsx`/`error.tsx`.
