# 03 — Frontend UI/UX Audit

Verification limits: only the homepage was visually verified in this session (headless Chrome at 1440 px, plus a 390 px iframe for the hero). Other pages are assessed from code. No Lighthouse or axe run was performed. Browser widths 320–2560 were **not** tested.

## Checklist results

| # | Check | Result |
|---|---|---|
| 1 | Visually complete | Homepage yes. Other existing pages: built, not re-verified this session. |
| 2 | Brand consistency | Tokens in `variables.css` match CLAUDE.md. Logo file `public/images/brand/finbyn-mart-logo.png` used by header and footer. |
| 3 | Official logo | Used unmodified in `MainHeader`. Footer reference not re-verified. A stale `public/finbyn-kart-logo.png` is still in the tree (modified, uncommitted). |
| 4 | Typography | Anton + Montserrat now render (verified on homepage). Root cause fixed this session: font variables were on `<body>` but consumed on `:root`, so the earlier Poppins/Playfair setup was also silently falling back to serif. |
| 5 | Image relevance | Category/industry images are AI-generated Antigravity assets; product images are Pexels photos. Hero uses a balcony photo, not an industrial setting as in the approved design. Supplier cards show Antigravity images; relevance not individually audited. |
| 6 | Image optimisation | `next/image` used. But `public/` is 21 MB, categories/industries/hero exist as both `.png` and `.jpg`, several PNGs are 600–900 KB, and catalog product images are hotlinked `unoptimized` from Myntra. |
| 7 | Responsive | Homepage hero verified at 390 px after an overflow fix (min-width on grid). Header top bar still clips ("Help") and the search "Products" select crowds at 390 px. Other pages unverified. |
| 8 | Buttons functional | Homepage CTAs link to routes. Requirement and inquiry submit buttons validate then show "not connected". |
| 9 | Forms validated | Yes, client-side (`src/lib/validations`); account forms are also validated server-side. Requirement/inquiry forms have no server. |
| 10 | Loading/empty states | `EmptyState` component exists. **No `loading.tsx` anywhere**; no skeletons. |
| 11 | Error states | Account forms show API error messages. **No `error.tsx`/`not-found.tsx`.** |
| 12 | Navigation links | Header/nav/footer targets: all resolve (real route, redirect or placeholder). `/categories/industrial-supplies` and `/categories/more` redirect to `/categories`. Verified by reading the redirect page; not click-tested. |
| 13 | Horizontal overflow | Fixed on homepage hero; elsewhere unverified. |
| 14 | Duplicate components | `/categories/[slug]` is an alias route. `ProductCard` is shared by homepage and category pages (intended). No other duplication verified. |
| 15 | Unused components | Not exhaustively checked. `framer-motion` dependency is unused. |

## Observations by area
- **Homepage**: matches the approved design's structure (dark teal nav, gold CTA, arc-framed hero, stacked stat cards, overlapping benefits strip, overlay category/industry cards, sliders). It cannot be pixel-identical: the reference is a 1024 px mockup with a factory-background photo that the project does not have.
- **Product detail / supplier listing / supplier profile**: built from shared components; the product card and supplier card were restyled this session, the detail pages were not.
- **Header**: mobile top bar clips at 390 px; "Products" select in the mobile header sits at the edge.
- **Stale config**: `next.config.ts` `remotePatterns` still lists `www.finbynkart.com`.
- **Accessibility**: skip link exists; `aria-labelledby` on sections; category/industry card images use empty alt with visible labels. No audit run.

## Recommendations (no changes were made)
Add `loading.tsx`, `error.tsx`, `not-found.tsx`; dedupe/convert large images to WebP; run Lighthouse and axe in a real browser; test 320–2560 px; supply the factory-background hero photo.
