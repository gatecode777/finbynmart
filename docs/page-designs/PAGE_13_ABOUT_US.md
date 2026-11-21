# About Us (original tracker Page 13, `/about-us`)

Status 2026-11-16: **Development: Implemented. QA: In Progress (browser and static checks below; not a full QA pass). Design: not marked complete (no owner approval of the design or of the copy). Prompt: delivered.** The copy is **draft positioning copy awaiting business approval**; it is not approved company content.

## What changed
- Replaced the placeholder: `/about-us` was served by the generic `/[page]` template ("This page isn't published yet"). A real static route now takes precedence (`src/app/about-us/page.tsx`); the template still serves the other unpublished footer pages. No alias was needed (`/about-us` was already the footer URL and the original route).
- Content lives in a small typed module, `src/lib/constants/aboutUs.ts` (the repository's existing pattern for static public content). No CMS, API, database collection, session or client JavaScript: the page is a server-rendered static page, so database availability cannot affect it and reading it mutates nothing.
- Styling: `src/app/about-us/about-us.module.css` (CSS Module, project tokens only, mobile first, no fixed text heights, reduced-motion respected). The header, navigation, footer, logo and breadcrumb are the existing shared ones; the Anton / Montserrat typography comes from the global stylesheet.

## Structure and content source
1. **Hero** (breadcrumb Home / About Us, the only H1 "Connecting businesses. Simplifying sourcing.", supporting text, actions **Explore Products** → `/products` and **Find Suppliers** → `/suppliers`) with an original decorative illustration (`AboutIllustration.tsx`: two business people at laptops, three product cards and conversation bubbles, drawn as inline SVG in the brand tokens; `aria-hidden`, nothing to load, fixed proportions, and the page is complete without it). The repository has no illustration file, so this one was drawn for the page.
2. **About Finbyn Mart**: one introductory sentence (not repeated elsewhere).
3. **Our purpose**: Easier discovery, Clear requirements, Organized conversations.
4. **Built for buyers and suppliers**: two cards (list items below).
5. **How sourcing connects**: 1 Discover, 2 Connect, 3 Compare.
6. **Final call to action** "Find the right starting point.": **Browse Products** → `/products`, **Contact Us** → `/contact-us` (the existing contact page; no new workflow).
All wording is the supplied proposed copy; nothing was added to it.

**Claim check against the built product** (statements the page relies on): browse products and supplier businesses (`/products`, `/suppliers`); share requirements (`/post-requirement` and the quote forms); review supplier responses and quotations (the buyer's inquiry and quotation pages); present business information (the supplier company profile and public supplier pages for approved supplier products); view relevant inquiries (supplier inquiry inbox); respond and prepare quotations (supplier responses and the quotation builder). These workflows exist in code. **They have not been runtime-verified against a database in this work**, and the page makes no reliability, response, matching, delivery, price, quality, verification or payment promise.

## Content awaiting business approval
- Every sentence in `aboutUs.ts` (draft positioning copy).
- Whether a company history, founding year, team, locations or a mission statement should ever be added (none was invented; they are simply omitted).
- Whether a designer-made brand illustration should replace the drawn SVG.

## Related finding outside this page (not changed)
The shared header top bar and footer carry unsupported claims ("10L+ Verified Suppliers", "50L+ Products", "India's trusted B2B marketplace", "verified suppliers"). They are global chrome, not part of this page, and contradict the project's own rule against unverified claims and counts (supplier verification is only now being built). They need a business decision and a separate change.

## Checks
| Check | Result | Evidence |
|---|---|---|
| `tsc --noEmit`, `npm run lint` | Passed | no errors or warnings |
| Production build (`NEXT_DIST_DIR=.next-audit`) | Passed | `/about-us` listed as a route; tsconfig restored |
| `79-about-us-unit-test.mjs` (10 static checks: static server component, replaced placeholder, existing CTA routes, required copy, no digits or claim words in the copy, no placeholder text, heading structure, decorative art, metadata, tokens) | Passed | 10 pass |
| Browser (headless Chrome against the dev server): one H1, heading order H1,H2,H2,H2,H3,H3,H2,H2, no horizontal overflow, no clipped text, no broken images, no console errors, no HTTP errors at **320, 360, 390, 430, 768, 1024, 1280, 1440 px, mobile landscape (844×390) and a desktop page at 200 % zoom (640 CSS px)** | Passed | probe output |
| CTA destinations (`/products`, `/suppliers`, `/products`, `/contact-us`) answer 200; footer "About Us" link → `/about-us` | Passed | |
| Keyboard: the five focusable elements in the main area (breadcrumb Home and four CTAs) each show a visible focus ring; no trap | Passed | |
| Network: the page itself makes no API request. The shared header requests `GET /api/auth/me` on every page (same on `/how-it-works`) | Passed (the call is global chrome) | |
| Screenshots | Captured at 390 and 1440 px (full page), inspected | scratchpad `about-390.png`, `about-1440.png` |
| Server-rendered HTML contains no account data, internal note or draft wording | Passed | built-server HTML grep |
| Not run: 200 % zoom at other widths, a screen reader, Firefox/Safari/real devices, contrast measurement with a tool (the page uses the project's text and button colour pairs), Lighthouse, signed-in rendering (the page reads no session) |
