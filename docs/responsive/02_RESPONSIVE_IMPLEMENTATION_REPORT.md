# Responsive Implementation Report

Date: 2026-11-02. Scope: every route that exists today (18 page patterns). The buyer, supplier, admin and super-admin dashboards listed in the brief **do not exist yet**, so they could not be made responsive; they are listed as "Not Tested / not built" below.

## How this was tested (and what was not)

| Item | What was done |
|---|---|
| Browser | Headless **Chrome** driven by `puppeteer-core` against a production build (`next start`). Chrome desktop and **Chrome device emulation** (iPhone 13 profile, touch events) only. |
| Not available | **Firefox and Safari/WebKit were not installed**, so nothing was tested there. **No physical devices** were used. |
| Routes | 20 URLs covering 17 of the 18 page patterns (the 18th, `/categories/[slug]`, is a redirect and was exercised by clicking the menu link). Includes a catalog product, a sample product, a catalog supplier, the sample supplier profile, the placeholder template and the 404 page. |
| Widths | 45 CSS widths per route, 900 route × width measurements: every width in the brief from 320 to 3440, plus landscape-phone widths (568, 740, 844, 915, 932) and the viewport widths that browser zoom 80–200 % produces at 1440 and 1920. Zoom was therefore **emulated by viewport width**, not by changing real browser zoom. |
| Screenshots | 12 sizes per route (320×640 … 2560×1440), 240 images in the working folder. 18 before/after images are committed to `docs/responsive/screenshots/`. The "before" set was taken before any fixes and its below-the-fold lazy images had not loaded, so compare layout, not image content. |
| Automated checks per measurement | page horizontal overflow; elements poking past the viewport; elements poking out of their own container (inputs, buttons, images); clipped text; distorted images; broken images; touch targets under 32 px (≤1024 px); header search width; category nav cut off; heading contrast; console errors. |
| Functional tests | 46 scripted checks (below). |
| Visual review | I looked at screenshots myself for: homepage (all sections at 390, plus 320, 483, 820, 1024, 1440, 2560), products + filter drawer, category, supplier profile, product detail, suppliers, post-requirement, sign-in, sign-up, register-supplier, categories, industries, industry detail, how-it-works, sitemap, search, help, 404, and the footer. |
| Not covered | Real keyboard-only walkthrough of every page (menu and filter drawers were tested), screen-reader testing, Lighthouse, print styles, and any width not in the list. |

## Results

| Metric | Before | After |
|---|---:|---:|
| Route × width measurements with horizontal page overflow | 21 (every route at 320 px, homepage also at 344 px) | **0 of 900** |
| Measurements with a control smaller than 32 px (≤1024 px) | 560 of 900 (up to 85 controls on one page) | **2 of 900** (18 px checkboxes inside 32 px-tall labels on the category filter) |
| Distorted images | 0 | 0 (a logo squash I introduced at 1024–1152 px was caught and fixed during the work) |
| Clipped text, container escapes, cut-off nav, tiny header search, low-contrast headings | not measured | **0** |
| Console errors | none from the app | none (the 404 page logs the expected 404 only) |
| Scripted functional checks | n/a | **46 of 46 pass** |

## Problems found and fixed

| # | Problem (how it was found) | Fix |
|---|---|---|
| 1 | **Mobile header unusable**: search field pushed off-screen at 390 px and account actions hidden below 1024 px (screenshot) | Two-row header on phones/tablets: menu, logo and account icon on row 1, full-width search on row 2; account icon keeps an accessible name |
| 2 | Page overflow at 320/344 px on every route (header search; benefits strip) | Search drops to its own row, label hides under 400 px; grids use `minmax(0, 1fr)` |
| 3 | Category hero stat cards overflowed at 320/344 px | Shrinkable grid, single column under 400 px |
| 4 | Logo squashed at 1024–1152 px (aspect-ratio check) | Logo never shrinks; `object-fit: contain` |
| 5 | Header search only ~100 px wide at 1024 px and category nav cut off at 1024–1399 px (visual review, then a new audit check) | Action subtitles hide at laptop widths, search gets a minimum width, two lower-priority nav entries wait for ≥1400 px (All Categories and More still reach them) |
| 6 | **No mobile filter drawer**: filters stacked above results on products, suppliers and category pages | New reusable `FilterDrawer` (button with active-filter count, slide-in panel, overlay, Escape, focus return, inert when closed); used on `/products`, `/suppliers` and `/category/[slug]` |
| 7 | Mobile menu had no focus handling and a blue overlay (off-brand) | Focus moves in, is trapped, returns to the button; teal overlay; 44 px targets |
| 8 | Duplicate element ids from two search bars on one page | `useId` |
| 9 | Announcement bar clipped "Help" on phones | Tagline hides under 640 px, extra claims wait for 1100 px, 36 px-tall links |
| 10 | Touch targets: footer, breadcrumb, product/supplier name links, chips, "Reset", pagination-adjacent links, social, view-all links | 32–44 px hit areas |
| 11 | Benefits strip and hero stat cards squeezed (words wrapping one per line, "Secure & Safe" clipped) | Icon above text on phones, tighter padding, sensible line-heights; a stray `<br>` I introduced was removed |
| 12 | Category cards: label and arrow overflowed the card on narrow screens | Sizes derived from card width (container queries) |
| 13 | Requirement form squeezed to ~34 px inputs inside the product-page panel; banner form overflowed the white card on phones | Auto-fit grid based on available width; smaller panel padding on phones |
| 14 | **404 page unreadable** (dark text on a black default page) | New branded `not-found.tsx` |
| 15 | Forms inconsistent (sign-in screenshot: autofill tint, uneven buttons) | One input/select/textarea style (48 px tall, 16 px text to stop iOS zoom, focus ring, error state), autofill override, equal-width centred account-switch buttons, 44 px buttons |
| 16 | Footer social links were plain words | Icon buttons (outline glyphs; Lucide has no brand icons) with accessible names |
| 17 | Testimonials looked plain | Card redesign (gold top rule, quote badge, avatar slot). See the limitation below |
| 18 | Product detail "Category / Colour" values indented | Reset default `dd` margin |

Breakpoints now used: 400, 480, 520, 560, 640, 767/768, 860, 900, 990/991, 1023/1024, 1100, 1200, 1279/1280, 1399/1400 px, plus fluid `clamp()`/`minmax()`/container-query sizing in between.

## Functional tests (touch via iPhone 13 emulation, mouse on desktop)

Mobile menu opens by tap, moves focus in, traps Tab for 25 presses, closes on Escape and on overlay tap, returns focus, and a menu link navigates · header search on mobile and hero search on desktop submit to `/search` · no duplicate ids · filter drawer button visible, drawer inert when closed, opens, Apply updates the URL, pagination page 2 works (products and suppliers) · category drawer opens, a checkbox filter changes the list (9 → 5 products), Clear All restores it, Escape closes, sort select responds, list/grid toggle present, desktop keeps the inline sidebar · requirement, sign-in and sign-up forms show validation when empty · sign-in with wrong credentials returns a real API error (no account was created or modified) · supplier profile tabs jump to their sections · featured-products slider arrow scrolls and the previous arrow enables · skip link is the first Tab stop · no console errors on the checked pages.

The 46 checks and the audit script are in `docs/responsive/tools/` (they need `npm i puppeteer-core` and a running server; they are not part of the app).

## Route-by-route status

"Responsive Complete" here means: passed every automated check at all 45 widths, passed the functional checks that apply, and I looked at it on a phone-width screenshot. It does not cover Firefox/Safari or real devices.

| Route | Status | Notes |
|---|---|---|
| `/` | Responsive Complete | Visually reviewed section by section |
| `/categories` | Responsive Complete | |
| `/categories/[slug]` | Responsive Complete | Redirect only |
| `/category/[slug]` | Responsive Complete | Filter drawer + filters verified on `apparel-fashion`; `packaging-printing` has 0 products and `industrial-machinery` has 1 (sample data), so those show an empty state / single card |
| `/how-it-works` | Responsive Complete | |
| `/industries`, `/industries/[slug]` | Responsive Complete | Food Processing image is only 296×144 and looks soft |
| `/post-requirement` | Responsive Complete | Form validates; submission is intentionally "not connected" |
| `/products` | Responsive Complete | Drawer, filters, pagination verified |
| `/products/[slug]` | Responsive Complete | Gallery is a single image, so there are no gallery controls to test |
| `/search` | Responsive Complete | |
| `/suppliers` | Responsive Complete | Drawer, filters, pagination verified |
| `/suppliers/[slug]` | Responsive Complete | Tabs verified; inquiry submit intentionally "not connected" |
| `/sign-in`, `/sign-up`, `/register-supplier` | Responsive Complete | Validation verified; account creation not exercised (it would write to the live database) |
| `/sitemap` | Responsive Complete | |
| `/[page]` placeholder (e.g. `/help`) | Responsive Complete | |
| 404 page | Responsive Complete | Newly branded |
| Buyer dashboard and account pages | Not Tested | Not built |
| Supplier dashboard and tools | Not Tested | Not built |
| Admin and super-admin | Not Tested | Not built |

Totals: 18 page patterns inspected; 18 Responsive Complete; 0 Partially Responsive; 0 Blocked; dashboards/admin (not built) Not Tested.

## Remaining limitations

- **Firefox, Safari/WebKit and real devices were not tested.** Chrome emulation is not a substitute for them.
- **Zoom was emulated by viewport width**, not real browser zoom.
- **Testimonials still use placeholder names ("Sample Buyer One…")** and no photos. Real customer names and photos cannot be invented; supply approved quotes (and photos with permission) in `src/lib/constants/testimonials.ts` — the card already shows a photo when `avatarSrc` is set.
- **Hero photo** is a balcony shot, not an industrial setting; **Food Processing** industry image is low resolution; both need new licensed images.
- **Catalog product images are hotlinked** from a third-party CDN (`http://assets.myntassets.com`, upgraded to https by the app). In heavy automated resizing a few requests failed with DNS errors; direct loads succeeded 3 of 3 times. Hosting your own images removes this risk.
- **Footer social links** point to generic root domains until real profile URLs exist.
- Category filter checkboxes are 18 px; their labels are 32 px tall, but the checkbox itself is smaller than the 24 px WCAG target.
- Dashboards, admin and super-admin screens, and a gallery for product detail pages do not exist, so none of their responsive requirements could be implemented.
- `next.config.ts` now accepts an optional `NEXT_DIST_DIR` so a test build can run beside `next dev` without overwriting `.next`.
- A Next.js dev-overlay "1 Issue" badge appeared in screenshots you sent; I loaded `/`, `/products` and `/category/apparel-fashion` on the dev server and saw no console errors or warnings, so I could not reproduce it.
