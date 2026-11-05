# Finbyn Mart — DESIGN.md

The single source of truth for visual design. Read it, `CLAUDE.md` and `docs/PAGE_TRACKER.md` before designing or building any page. Values here were checked against `src/styles/variables.css`, `src/styles/typography.css` and the components in `src/components/` on 2026-11-02; where the code and an aspiration differ, the difference is listed under "Known inconsistencies".

Official homepage reference: `docs/design-references/01-homepage-reference.png` (teal + gold design). The navy/blue "Finbyn Kart" images in `docs/references/` are archived history and must not be used as design direction.

## 1. Brand colors

Primary Teal **#04534F** is the dominant brand color (`--primary`). Gold is a selective accent. White and soft neutrals give breathing room.

| Name | Hex | Token | Use |
|---|---|---|---|
| **Primary Teal** | **#04534F** | `--primary` | Headings, primary buttons, icons, links, hero heading line 1 |
| Dark Teal | #033F3C | `--primary-dark` | Navigation bar, footer accents, primary-button hover |
| Deep Teal | #023330 | `--primary-deep` (= `--navy`) | Top utility bar, deepest backgrounds, image-card overlays, section titles |
| Secondary Teal | #056263 | `--navy-secondary` | Secondary teal elements |
| Bright Teal | #05777C | `--primary-bright` | Highlight words in headings, hover borders, focus ring tint |
| Golden Yellow | #FDB304 | `--accent` | Primary CTA ("Get Best Price"), highlight words, arcs, stars |
| Gold Hover | #EAA300 | `--accent-hover` | Gold hover state |
| Light Gold | #FCE29E | `--accent-light` | Soft highlights |
| Soft Cream | #FFF7E5 | `--accent-soft` | Highlight backgrounds |
| Light Mint | #EAF5F3 | `--primary-light` / `--surface-blue` (legacy name, same value) | Section and card backgrounds |
| White | #FFFFFF | `--background`, `--surface` | Page and card surface |
| Soft Grey | #F6F8F7 | `--background-soft` | Alternate section background |
| Primary Text | #183A38 | `--text-primary` | Body and headings on light |
| Secondary Text | #526563 | `--text-secondary` | Supporting text |
| Muted Text | #6A6C6C | `--text-muted` | Metadata |
| Border | #DCE8E5 | `--border` | Hairlines and card borders |
| Strong Border | #C3D3D0 | `--border-strong` | Form-control borders |

Semantic colors (`--success` #087A55, `--warning` #B87900, `--danger` #C43D3D, `--success-light`) are for status only, never for branding.

Rules: no navy/blue as a brand color, no purple, pink or neon, no gradients other than a subtle mint wash on the hero and image-overlay scrims. Never hard-code a hex that has a token. Keep text contrast at least 4.5:1 (3:1 for large display type). Gold text on white is only acceptable at display sizes.

## 2. Typography

| Role | Font | Notes |
|---|---|---|
| Display | **Anton** (`--font-heading`) | Single 400 weight, never bold it. Used for `h1`/`h2`, section titles, stat numbers. Uppercase. |
| Body and UI | **Montserrat** (`--font-sans`) | 400 body, 500 navigation, 600 buttons/labels/card titles, 700 emphasis. |

Both load through `next/font/google` in `src/app/layout.tsx`, with their CSS variables set on the `<html>` element (setting them on `<body>` silently falls back to Times, as happened before).

Type scale (fluid): `--fs-xs` 12–13px · `--fs-sm` 13–14px · `--fs-base` 15–16px · `--fs-lg` 17–19px · `--fs-xl` 20–24px · `--fs-2xl` 24–32px · `--fs-3xl` 30–44px · `--fs-4xl` 36–56px. Section titles use `clamp(2rem, 1.5rem + 2vw, 3.25rem)`; the hero heading uses `clamp(2.25rem, 1.2rem + 3.1vw, 4rem)`. Weights and line heights have tokens (`--fw-*`, `--lh-tight` 1.1, `--lh-snug` 1.3, `--lh-body` 1.55).

Form controls use `max(1rem, var(--fs-sm))` so iOS does not zoom on focus. Uppercase is for display headings, category labels and eyebrows only, never for paragraphs or buttons. No other font families.

## 3. Visual language

Professional Indian B2B marketplace: compact but readable hierarchy, strong uppercase display headings with a teal/gold two-tone treatment, image-led category and industry discovery, clean white cards on mint or soft-grey bands, subtle borders and shadows, clearly visible gold and teal calls to action, and trust indicators (verified badges, stats, benefits strip). Avoid generic SaaS dashboard styling on public pages. Dashboards may be denser but keep the same identity.

## 4. Design tokens (in `src/styles/variables.css`)

| Group | Tokens |
|---|---|
| Colors | see section 1 |
| Typography | `--font-sans`, `--font-heading`, `--fs-xs … --fs-4xl`, `--fw-regular/medium/semibold/bold`, `--lh-tight/snug/body` |
| Spacing (4px scale) | `--space-1` 4 · 2 8 · 3 12 · 4 16 · 5 20 · 6 24 · 8 32 · 10 40 · 12 48 · 14 56 · 16 64 · 20 80 · 24 96 |
| Container | `--container-width` 1440px, `--container-pad` clamp(16px, 3vw, 40px) |
| Radii | `--radius-xs` 4 · `sm` 5 · `md` 8 · `lg` 12 · `xl` 16 (image cards use 20px, a documented exception) |
| Shadows | `--shadow-card` 0 3px 12px rgba(2,51,48,.07) · `--shadow-hover` 0 8px 22px rgba(2,51,48,.13) |
| Transitions | `--transition-fast` 160ms · `--transition-normal` 220ms |
| Z-index | `--z-raised` 1 · `--z-sticky` 10 · `--z-overlay` 100 · `--z-drawer` 101 · `--z-modal` 200 · `--z-toast` 300 |
| Breakpoints | documented in a comment (CSS variables cannot drive media queries) |

Breakpoints: primary 480 / 768 / 991–1024 / 1280 / 1440; also in use 400, 520, 560, 640, 860, 900, 1100, 1200, 1400.

## 5. Global layout

- `Container` (`.container`): `width: min(100% - 2 × --container-pad, --container-width)`, centred. All page content sits in it. Never use fixed page widths.
- Section rhythm: `--space-12` (48px) vertical padding on homepage sections, `--space-8` on inner pages; headings have a `--space-8` bottom margin.
- Global chrome from `src/app/layout.tsx`, rendered once: utility bar (36px, `--navy`) → main header → category navigation (40px, `--primary-dark`, desktop ≥1024 only) → `<main>` → footer.
- Header: logo (36px phone, 44px tablet, 48px laptop+, never squashed); below 1024px it is two rows (menu button, logo, account icon; then a full-width search); at ≥1024px one row with search (min 240px), gold "Get Best Price" button, Sign In, For Suppliers. At 1024–1279px the action subtitles hide.
- Category navigation: nine items; items 6–7 (Home & Lifestyle, Food & Beverages) show from 1400px so the rest never get cut off. 1024–1279px uses a smaller font and gap.
- Footer: white, logo, description, round social icon buttons, link columns (2-up on phones, 3-up from 640px, 6-up from 1024px), legal row.

## 6. Shared components

All live under `src/components/`. Reuse them; extend the shared one rather than creating a look-alike. Status against the standard component list:

| Standard component | Status | Where |
|---|---|---|
| MainHeader | Exists | `layout/MainHeader` |
| TopUtilityBar | Exists as `AnnouncementBar` | `layout/AnnouncementBar` |
| MainNavigation / CategoryNavigation | Exists | `layout/CategoryNavigation` |
| MobileNavigation | Exists (focus trap, Escape, 44px targets) | `layout/MobileNavigation` |
| MainFooter | Exists as `Footer` (+ `SocialIcon`) | `layout/Footer` |
| Breadcrumbs | Exists | `ui/Breadcrumb` |
| PageContainer | Exists as `Container` | `ui/Container` |
| SectionHeading | Exists | `ui/SectionHeading` |
| PrimaryButton / SecondaryButton | Exists as `Button` variants `primary`, `secondary`, `ghost`, `accent` | `ui/Button` |
| SearchBar | Exists (`default` and `large`) | `layout/SearchBar` |
| ProductCard | Exists | `category/ProductCard` |
| SupplierCard | **Duplicated**: homepage `SupplierCard` and catalog `SellerCard` | see Known inconsistencies |
| CategoryCard | Exists (white image-led card for category pages) | `category/CategoryCard`; the homepage overlay tiles in `CategoryShowcase` and `IndustrySolutions` are a different, documented style |
| FormField / Input / Select | Exists (`Input`, `Select` include label and error) | `ui/Input`, `ui/Select` |
| Textarea | **Missing**: two separate `.textarea` styles in module CSS | create `ui/Textarea` |
| Modal | **Missing** (supplier gallery has its own lightbox) | |
| Drawer | Partial: `FilterDrawer` and `MobileNavigation` are separate implementations | consolidate |
| Dropdown | **Missing** (native `select` only) | |
| Pagination | Exists | `ui/Pagination` |
| LoadingState / ErrorState | **Missing**: no `loading.tsx` or `error.tsx` anywhere | |
| EmptyState | Exists | `ui/EmptyState` |
| Toast / ConfirmationDialog | **Missing** | |

Other shared pieces: `CategoryExplorer`, `CategoriesHero`, `ScrollSlider` (scroll-snap slider with arrows), `FilterBar` (server GET form), `FilterDrawer`, `MediaTile`, `Badge`, `IconButton`, `PageIntro`, `PageBody`, `ResultGrid`, `ResultSummary`, `TileLinkCard`.

### Component standards

- **Buttons**: 44px minimum height, radius `--radius-md`, Montserrat 600. Primary = teal fill, white text, hover `--primary-dark`. Gold CTA = `--accent`, hover `--accent-hover`, text `--primary-deep`. Secondary = white with teal text and border. Disabled 60% opacity.
- **Inputs, selects, textareas**: 48px tall, radius `--radius-md`, 1px `--border-strong`, hover border `--primary-bright`, focus `--primary` border plus a 3px `rgba(5,119,124,.2)` ring, error border `--danger` with a message below and `role="alert"`. Labels sit above in 14px/600. Browser autofill is overridden to white.
- **Cards**: white, 1px `--border`, radius `--radius-lg` (12px) for product/supplier/testimonial cards, `--shadow-card`, hover `--shadow-hover` with a 2px lift. Image-led category and industry cards: radius 20px, full-bleed photo, bottom scrim from transparent to `rgba(2,51,48,.85)`, uppercase white label, circular white arrow button, slow hover zoom.
- **Badges**: "Verified" uses the success pair; the gold "Best Seller" badge sits on the image.
- **Touch targets**: controls at least 44px, text links at least 32px tall.
- **Pagination, breadcrumbs, empty states**: use the existing components; breadcrumbs and footer links keep 32px hit areas.
- **Tables** (none exist yet): wrap in a horizontally scrollable container or switch to stacked cards on phones; never drop columns silently; keep row actions reachable.
- **Dashboards**: a responsive sidebar (drawer below 991px), cards in a `repeat(auto-fit, minmax(…))` grid, same tokens.

## 7. Image standards

- Use relevant images only; never random stock, never invented supplier identities, logos or customer photos.
- Use existing project assets first. Check licences before adding images; record every image in `docs/IMAGE_SOURCE_MANIFEST.md`.
- Store images under `public/images/<area>/` (`brand`, `hero`, `categories`, `industries`, `products`, `suppliers`, `banners`). The brief mentions an ImageKit workflow; **no ImageKit integration exists in this project**, so local folders are the approved workflow until one is set up.
- Consistent aspect ratios (category cards 4:5, industry cards 4:3, product images 1:1, supplier images 16:10); `object-fit: cover`; `next/image` with a correct `sizes`; lazy-load below the fold (hero uses `priority`).
- Provide a branded fallback (the icon `MediaTile`) when an image is missing; meaningful `alt` text, empty `alt` for images that duplicate adjacent text.
- Prefer at least 800px on the long edge for card images. Currently low-resolution: the Food Processing industry image (296×144).

## 8. Responsive design

Mobile-first. Test widths: 320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560, and browser zoom 80–200%.

| Area | Phone (<640) | Tablet (640–1023) | Laptop+ (≥1024) |
|---|---|---|---|
| Header | Two rows; menu, logo, account icon, then full-width search; icon-only search label under 400px | Same two rows; account shows its text | One row with all actions |
| Navigation | Slide-in menu with focus trap | Same | Dark teal bar |
| Hero | Photo first, then heading, search, popular searches, 2×2 stat cards | Same, wider | Text left; arc-framed photo bleeding to the right edge; stat cards stacked at right |
| Benefits strip | 2×2, icon above text | 2×2, icon beside text | One row of four, overlapping the hero |
| Category cards | 2 columns | 3 columns | 5 columns |
| Product and supplier rows | Sliders with a peek of the next card | 2–3 visible | 4 visible |
| Industry cards | 2 columns | 4 columns | 4 columns |
| Forms | One column, 48px controls | Two columns where space allows | Multi-column by available width (auto-fit grids) |
| Filters | Drawer from the left | Drawer below 768/991px | Inline bar or sidebar |
| Footer | 2 link columns | 3 | 6 |

Grid tracks that hold inputs or text must use `minmax(0, 1fr)` so content cannot force overflow. Size card contents from the card (container queries) rather than the viewport. Never scale the page with transforms or zoom.

## 9. Interaction standards

- Hover: color or border change plus, for cards, a 2px lift and `--shadow-hover`; image cards zoom 6% over 0.5s.
- Focus: visible `:focus-visible` outline (2px `--primary`, 2px offset) globally; form controls add the teal ring. Never remove focus indicators.
- Active, disabled, loading: disabled = 60% opacity, not-allowed cursor; submitting buttons are disabled with the label changed.
- Validation: inline messages, `aria-invalid`, `role="alert"`; never a fake success. The requirement and inquiry forms currently show an honest "not connected" message.
- Dialogs and drawers: Escape closes, overlay click closes, focus moves in and returns to the trigger, body scroll locks, closed drawers are `inert`.
- Motion: subtle (160–250ms), purposeful, and removed under `prefers-reduced-motion`.
- Touch: 44px targets, no hover-only functionality.

## 10. Accessibility

Semantic landmarks (`header`, `nav`, `main`, `footer`) with a skip link; every control has an accessible name; section headings use `aria-labelledby`; decorative icons are `aria-hidden`; contrast checked on headings; reduced-motion honoured. Automated accessibility scoring (axe, Lighthouse) has not been run yet.

## 11. Page-specific specifications

One file per approved page in `docs/page-designs/` (`docs/page-designs/01-homepage.md`, `docs/page-designs/02-all-categories.md`, …), listing objective, reference image, layout, section order, components, typography, colors, desktop/tablet/mobile design, interactions, data, loading/empty/error states, accessibility and acceptance criteria. Progress is tracked in `docs/PAGE_TRACKER.md`.

## 12. Known inconsistencies (to resolve, not to copy)

- Two supplier card implementations (`homepage/FeaturedSuppliers/SupplierCard`, `supplier/SellerCard`) plus `SupplierProfileCard`.
- Several call-to-action links are styled in module CSS instead of using `Button` (product, supplier and homepage card CTAs, account-switch links).
- Two `.textarea` styles in `AccountForm.module.css` and `SupplierInquiryForm.module.css`; no shared `Textarea`.
- Hard-coded z-index values (1, 10, 100, 101, 110, 111) in component CSS; tokens now exist.
- Two drawer implementations (`FilterDrawer`, `MobileNavigation`).
- `AppPromotion` component is no longer rendered on the homepage but its folder remains.
- A stale `public/finbyn-kart-logo.png` is still in the tree.
- `next.config.ts` image allow-list still names the old `www.finbynkart.com`.
