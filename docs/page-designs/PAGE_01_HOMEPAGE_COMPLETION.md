# Page 01 — Homepage completion

Route `/` · Portal PUBLIC · Tracker ID 01. The homepage existed (ten sections). This change closes verified gaps only; layout, palette, typography, section order, cards and imagery are unchanged.

## Evidence-based gap table (inspected in current source, 2026-11-20)
| Section / action | Requirement source | Current implementation (before) | Verified gap | Fix |
|---|---|---|---|---|
| Featured Products | audit row 01, CLAUDE.md "no fake data presented as real" | `FEATURED_PRODUCTS` hard-coded sample records | Incorrect data connection: sample records shown as live inventory | Reads the public All Products engine (`getProductListing` after `ensureApproved`), sample source excluded, first 5 in default order |
| Featured Suppliers | same | `FEATURED_SUPPLIERS` constants | Incorrect data connection | Reads `getSupplierListing` (the `/suppliers` service), first 5, links are the directory's own `/suppliers/<slug>` |
| "Featured" label | CLAUDE.md / brief: do not invent rankings | label implied a selection that does not exist | Misleading copy | Headings now "Browse Products" / "Browse Suppliers" with View All links (`/products`, `/suppliers`); no ranking claimed |
| Testimonials | `MISSING_ASSETS.md`, audit | "Sample Buyer One/Two/Three", "for layout only" | Placeholder content | Section removed from the page (component and constants deleted) until genuine approved quotes exist |
| Stats "10L+ / 50L+ / 10,00,000+ / 50,00,000+", "28+" | audit, `MISSING_ASSETS.md` | invented counts in hero, announcement bar and network banner | Fabricated metrics | Numbers removed: hero cards are descriptive, the network banner's stats bar is removed, the announcement bar items removed |
| "Verified/Trusted/Best price/Safe & Secure" copy | sellers are never shown as verified; no payment/price/security guarantees | hero, trust band, requirement banner, network banner, process step, footer, header "Get Best Price" | Unsupported claims | Neutral factual wording (e.g. "Get Quotes", "Inquiries in One Place") |
| Page is static | needs request-time catalogue | prerendered | Data would freeze at build | `export const dynamic = "force-dynamic"` |
| Whitespace-only search | brief | silently ignored | Unclear behaviour | Clears stray spaces and returns focus to the field (no navigation) |
| Search types, popular searches, categories, industries, requirement strip, sign-in/register, footer links | brief | already connected and working | none | verified only (see checks) |
| Help / Track Inquiry links | existing | served by the generic "not published yet" page | Content decision, not software | left; recorded below |

Optional enhancements deliberately NOT done: a featured selection rule, rankings, any counts, a separate homepage section for approved supplier products (they already appear through the shared listing).

## Data sources and eligibility
Products: the one listing engine behind `/products` (approved supplier products via `ensureApproved` plus the catalogue CSV; `meta.source === "sample"` excluded; a bounded read of 15, 5 shown; deterministic default order, so the first five currently come from one brand family: a selection rule is an owner decision). Suppliers: `getSupplierListing` (CSV sellers; verification exactly as the service reports it). A failed read renders a section-level message with a link ("could not be loaded"), distinct from the genuine empty message; the rest of the page still renders. Loading performs no writes.

## Files
`src/components/homepage/FeaturedProducts/FeaturedProducts.tsx`, `FeaturedSuppliers/FeaturedSuppliers.tsx`, `IndiaNetworkBanner`, `HeroSection`, `RequirementBanner` (copy), `src/app/page.tsx`, `src/lib/constants/trust.ts`, `process.ts`, `AnnouncementBar.tsx`, `HeaderActions.tsx`, `MobileNavigation.tsx`, `Footer.tsx` (copy), `SearchBar.tsx` (whitespace). Deleted: `Testimonials/`, `constants/testimonials.ts`, `constants/featuredProducts.ts`. Unused `.statsBar` CSS rules remain in `IndiaNetworkBanner.module.css`.

## Checks actually performed (production build, MongoDB deliberately unreachable)
- tsc, lint, production build: clean.
- `93-homepage-http-check.mjs`: status 200; new headings present; no sample, invented-number, "Verified Suppliers" or "Best Price" text; 76 internal links resolve; product links unique. Passed.
- `94-homepage-browser-check.mjs` (Chrome, 37 checks; two consecutive full runs with 0 failures; one earlier run had a single timing flake in the Services search step): no horizontal overflow, one h1, no heading jumps, alt attributes present, no console errors and **no write requests on load** at 320/360/390/430/768/1024/1280/1440 and landscape 844x390 / 640x360; 200% zoom simulation (640 px at 2x) without overflow; lab CLS 0.029 (one run); Enter and button search, encoded special characters, whitespace-only, Services type, Suppliers type (goes to `/suppliers?q=`), back/forward; popular-search links; first product and supplier destinations resolve (200); the requirement strip validates and Continue opens `/post-requirement?product=&quantity=&city=` without submitting; Tab reaches 22 controls with visible focus. Screenshots: `docs/page-reports/screenshots/01-homepage-*.png`.

## Not verified / blocked
- Real MongoDB: approved supplier products appearing on the homepage and unpublish/suspension exclusion at runtime (blocked, no isolated database); only the CSV-backed path was exercised.
- The section failure message was not triggered at runtime (the CSV read does not fail with the database down); it is code-reviewed only.
- Destination workflows (post-requirement submission, sign-in, registration) are not verified by this task. Firefox, Safari, real devices, screen readers, contrast measurement and Lighthouse were not run.

## Outstanding content decisions
Genuine testimonials (or none); approved business metrics; a "featured" selection rule; the "Get Best Quote" button wording on product cards (unchanged, outside this page's scope); Help Center and Track Inquiry are unpublished placeholder pages; imagery licensing per `docs/IMAGE_SOURCE_MANIFEST.md`.
