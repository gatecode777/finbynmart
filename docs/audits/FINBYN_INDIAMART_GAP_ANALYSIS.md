# Finbyn Mart vs IndiaMART: core sourcing gap analysis

Date: 2026-11-16 · Audit and report only. No application code, UI or `PAGE_TRACKER.md` was changed. Finbyn's design system, name, logo and teal/gold branding are kept as they are; this report compares **pages, features, navigation access and buyer-supplier workflows**, not visual design.

Evidence labels used throughout: **OBSERVED** (seen in a fetched public IndiaMART page), **DOCUMENTED** (official help titles; article bodies were not opened), **LOGIN-ONLY** (not verifiable), **INFERENCE** (my reading, not an IndiaMART requirement), **TRACED** (read in Finbyn code), **TESTED** (a Finbyn test or HTTP/browser run), **UNVERIFIED** (code exists, no runtime evidence).

## A. Plain-English conclusion
Finbyn already has the *skeleton* of an IndiaMART-style sourcing marketplace: public search with a Products/Suppliers selector, category and supplier pages, product pages with "Get Best Quote", a buyer portal (inquiries, quotations, comparison, saved items, notifications), a supplier portal (inbox, leads, products, quotations, company profile) and four admin tools. The automatic DIRECT + MATCHED lead rule, private buyer-supplier conversations and offer comparison are **implemented in code but unverified at runtime**, because no isolated test database exists yet.

The biggest differences are not visual:
1. **The general "Post Your Requirement" flow is a dead end.** It saves a record in `requirements` that no buyer page, supplier page, admin page or worker ever reads (TRACED: the collection is touched only by `src/lib/requirements/service.ts`). On IndiaMART, posting a requirement is the central way buyers reach suppliers (OBSERVED: "Post Requirement" in the hero, a header "Get Best Price", footer "Post Your Requirement"; the flow itself is LOGIN-ONLY). Finbyn's working lead path exists only for *product* inquiries.
2. **Nothing has been proven end to end.** All integration suites are blocked, the lead worker has no scheduler, and production configuration (`DISTRIBUTION_WORKER_SECRET`, `QUOTATION_TAX_RULES`) is not set.
3. **Product data is thin.** Supplier-created products have no structured specifications, so cards show no attributes (IndiaMART's listing cards OBSERVED showing attributes such as composition/width/GSM) and approved supplier products cannot be matched.
4. **Communication is hard to reach.** Conversations exist but only inside one requirement's detail tab; there is no cross-requirement Messages entry (IndiaMART shows a "Messages" counter in its headers, OBSERVED).
5. **Operations gaps:** no unpublish action, no company suspend/activate screen, no supplier-side read state or lead notes.

No second portal is needed. Everything below extends the existing buyer, supplier and admin portals.

## B. Portal coverage
| Portal | Exists (TRACED unless noted) | Missing or weak |
|---|---|---|
| Public | Home, `/categories` (+ sub), `/products`, `/products/[slug]`, `/search` (Products/Suppliers selector), `/suppliers`, `/suppliers/[slug]` (+ products, certifications, reviews), `/inquiry/[supplier]`, `/post-requirement`, `/how-it-works`, `/industries`, `/contact-us`, sign-in/register for buyer and supplier, `/sitemap`; approved supplier products and `c-<id>` company profiles join the same engine | General requirement goes nowhere; no help/FAQ landing for buyers and sellers besides support tickets; product cards carry no specification attributes |
| Buyer | Dashboard, My Inquiries (+ detail with Supplier Responses, private conversation, offers, matching status), Quotations (+ detail, compare, confirm order), Orders, Saved Products/Suppliers, Compare, Profile, Addresses, Settings and notifications, Security, Support | No view of posted general requirements; no Messages entry across requirements; conversations are one click deep inside an inquiry |
| Supplier | Dashboard, Inquiries & Leads (All / Direct / Matching), lead detail with reply, quotation builder, quotations list/detail/versions, My Products (draft, edit, review submission), Inventory, Analytics, Company Profile, Settings, Security, Support | No structured specifications; no unread/new state or lead notes; no Messages entry; no unpublish; approved products are not matched |
| Admin | Company-seller links, Product review, Inquiry oversight (+ export), Support tickets | No unpublish, no company/user restriction screen, no category management (categories are static code), no scheduler visibility for the lead worker |

## C. Comparison matrix
| Reference pattern | Official source (observed 2026-11-16) | Finbyn page / route | Current implementation | Gap class | Required action | Priority |
|---|---|---|---|---|---|---|
| Search with a type selector | https://www.indiamart.com/ (search box; the capture showed no Products/Suppliers toggle, so only the box is OBSERVED) | header `SearchBar` | Products/Suppliers selector, suggestions | MATCHES CORE NEED | none | n/a |
| Post a requirement | https://www.indiamart.com/ (hero, footer); the form is LOGIN-ONLY (`buyer.indiamart.com` returns a sign-in gate) | `/post-requirement`, `/api/requirements` | Saves to `requirements`; **nothing reads it** | INTEGRATION GAP + MISSING FEATURE | decide matching rule for free-text requirements (section H, task 1), give the buyer a "My requirements" view and suppliers a way to receive them | P0 |
| Industry then category hierarchy with breadcrumbs | https://www.indiamart.com/, https://dir.indiamart.com/impcat/cotton-fabric.html (OBSERVED) | `/categories`, `/categories/[slug]/[sub]` | Main category, department, product category; breadcrumbs | MATCHES CORE NEED | none | n/a |
| Category listing: sub-category chips, city chips, grid/list, load more | `dir.indiamart.com/impcat/cotton-fabric.html` | `/categories/*`, `/products` | Facet sidebar (category, city/state, colour, MOQ, price), pagination | MATCHES CORE NEED (different control style; no new work) | none | n/a |
| Product card: price + unit, attributes, supplier, city, years, response rate, rating, CTA | listing page above (OBSERVED; MOQ not shown on those cards) | `ProductCard` | Price, unit, MOQ when present, supplier, city, "Get Best Quote"; no attributes, no response rate | UI/UX GAP (attributes) | show up to three real specification attributes once drafts capture them (needs data first) | P1 |
| Trust labels (TrustSEAL, GST, Payment Protected, response rate) | listing, product, company pages (OBSERVED) | none | Finbyn shows no verification; correctly absent (no workflow) | DEFERRED / NOT REQUIRED | do not add badges without a real verification workflow | Deferred |
| Product detail: price, attributes, supplier block, CTA above supplier | `proddetail/plain-cotton-fabric-23205079862.html` (OBSERVED: "Get Latest Price", attribute list, supplier facts, no MOQ/spec table) | `/products/[slug]` | Gallery, price, MOQ, quantity, "Get Best Quote / Send Inquiry / Request Bulk Price", supplier block | MATCHES CORE NEED | none (spec table fills once specs exist) | n/a |
| Company profile with tabs (Home, Products, About, Photos, Contact) and "Get Best Quote" | `indiamart.com/geetharamani-mills/` (OBSERVED) | `/suppliers/[slug]` (+ tabs) | About, Products, Certifications, Reviews; contacts hidden by policy | MATCHES CORE NEED (no Photos tab, contact intentionally withheld) | none now | n/a |
| Buyer requirement list ("View and delete buy requirements") | help.indiamart.com Buying category (DOCUMENTED, title only) | `/buyer/inquiries` | Lists inquiries only; no posted requirements | MISSING FEATURE | add posted requirements to the same list (task 1) | P0 |
| Messages entry | headers show a "Messages" link/counter (OBSERVED); chat behaviour is LOGIN-ONLY | per-inquiry conversation tab | Private conversation exists; reachable only inside one inquiry | UI/UX GAP + MISSING PAGE (Messages list) | one Messages list per portal over the existing conversation APIs | P1 |
| Seller lead handling ("Buy Leads", "Lead Manager") | seller/help hosts (links and titles OBSERVED/DOCUMENTED; mechanics LOGIN-ONLY) | `/supplier/inquiries` | Direct + matching inbox, recipient-scoped status, reply, quote | IMPLEMENTED, UNVERIFIED | run the integration suites; add unread state | P0 / P1 |
| Seller catalogue ("Building Your Catalog") | help Selling category (DOCUMENTED) | `/supplier/products/*` | Draft, images, price, MOQ, review submission; no specifications | MISSING FEATURE (specifications) | category-based specification fields | P1 |
| Seller account / company details | help Selling category (DOCUMENTED) | `/supplier/company`, `/supplier/profile` | Present | MATCHES CORE NEED | none | n/a |
| Buyer sign-in by mobile OTP | `buyer.indiamart.com` (OBSERVED: +91 field, Send OTP) | `/sign-in` | E-mail/password | DEFERRED / NOT REQUIRED | needs an OTP provider; do not fake | Deferred |
| Help centre with Buyer and Seller categories | help.indiamart.com (OBSERVED) | `/supplier/support`, `/buyer/support`, `/contact-us` | Ticketing, FAQ inside support | UI/UX GAP | a public help page grouping Buyer and Seller how-tos, reusing the existing FAQ module | P2 |
| Paid tiers, Lens image search, videos, loans, payment protection, shipping | home/seller/help hosts (OBSERVED) | none | none | DEFERRED / NOT REQUIRED | out of scope | Deferred |

## D. Missing pages only
1. **Messages list** (buyer: `/buyer/messages`, supplier: `/supplier/messages`): one list of conversations (supplier name or buyer business name, requirement reference, latest message summary, last activity) linking into the existing conversation panels. Justification: conversations are otherwise reachable only through one inquiry (the headers of both reference sites expose a Messages entry; OBSERVED on IndiaMART).
2. **Admin Companies** (`/admin/companies`): suspend/reactivate a supplier company and see its status. Justification: public eligibility, lead eligibility and notices all depend on `supplier_companies.status`, and nothing in the product can change it today (TRACED).
3. Nothing else is a missing *page*. Posted requirements belong inside the existing My Inquiries list and the supplier Inquiries & Leads list (section E), not new pages.

## E. Existing pages needing changes
| Page | Change |
|---|---|
| `/post-requirement` + `/api/requirements` | After the matching decision (task 1): persist through the canonical requirement model, show the real reference and distribution state, stop saving into a collection nobody reads |
| `/buyer/inquiries` (+ detail) | List posted requirements with a Requirement/Inquiry type label; keep one reference system |
| `/supplier/inquiries` | Add an explicit "new/unread" state with an authorised mark-as-read mutation; keep "New" (status) and "Unread" (read state) separate |
| `/supplier/products/new` and `/edit` | Category-driven specification fields (stored in the draft and snapshot); show them in the review screen |
| `ProductCard`, `/products/[slug]` | Display up to three real specification attributes and the specification table from the approved snapshot |
| `/admin/product-review` | Add Unpublish for an approved product (sets the archive/unpublish fact the loader already respects), with an audit row and a supplier notice |
| Buyer and supplier sidebars | Add the Messages entry once the page exists; keep "Soon/not built" text only where a feature truly is absent |
| Dashboards (both) | Pending-reply and new-lead counters from the same definitions as the inboxes (supplier done; buyer shows reply/offer counts only on the list) |

## F. Essential operational dependencies
Required for Finbyn operations (not an observed IndiaMART feature; IndiaMART's internal admin is not observable):
- **Company-seller association** (exists, `/admin/company-links`): a company with no catalogue seller still works through its implicit `co:` key; catalogue sellers still need an admin link.
- **Product review and publish** (exists) **plus unpublish** (missing): needed for takedowns.
- **Company status control** (missing): without it a bad actor cannot be removed from leads and public pages.
- **Category management**: categories are code constants; acceptable for now, flag when more categories are needed.
- **Inquiry oversight and support staff** (exist, UNVERIFIED).
- **Audit records** (exist for link, review, support).
- **Worker execution**: `POST /api/internal/distribution` needs `DISTRIBUTION_WORKER_SECRET` and a scheduler (none deployed). Without it matched leads stay "Processing".
- **Configuration**: `QUOTATION_TAX_RULES` (else quotations cannot be submitted), ImageKit keys, admin accounts with capabilities.
- **Verification environment**: an isolated, transaction-capable database to run the four prepared integration suites.

## G. Not needed right now
Subscriptions and paid tiers (OBSERVED on IndiaMART: Star/Leader/Maximiser services listed by name only), lead purchasing, TrustSEAL-style paid badges, payment protection, checkout, shipping/dispatch, inventory beyond the existing ledger, loans, video, image search, mobile-OTP sign-in, a Hindi interface, a seller CRM/API for leads, tenders, a second portal, new buyer "tools" pages, any redesign or recolouring.

## H. Prioritized implementation sequence (next five tasks)
1. **P0, decide and connect general requirements.** *Decision first:* Finbyn's mandatory-matching rule is exact-product equivalence, so a free-text requirement cannot be matched safely. Choose one: (a) the form must pick a catalogue product or category with required attributes and matching uses that structure; (b) general requirements go to admin inquiry review and are routed manually; (c) the form is limited to product inquiries and the generic form is removed from navigation. *Acceptance (after the choice):* a posted requirement has one reference, appears in the buyer's list with its real distribution state, reaches the intended suppliers or the reviewer, nothing matches by category or name similarity alone, and no success is shown for an unsaved requirement.
2. **P0, verify what exists.** Provide an isolated database and run the four suites (`docs/testing/TEST_ENVIRONMENT.md`). *Acceptance:* each suite reports PASS, every failure fixed without weakening an assertion, readiness report updated with runtime evidence.
3. **P0, make the worker run.** Set `DISTRIBUTION_WORKER_SECRET` and `QUOTATION_TAX_RULES`, add a scheduler calling the worker about every minute. *Acceptance:* a submitted product inquiry reaches COMPLETED or NO_MATCHES without anyone opening a page; a failed job shows FAILED and can be retried with the secret.
4. **P1, structured specifications.** Category-based fields in the supplier draft, snapshot, review, public card and detail. *Acceptance:* a submitted revision carries its specifications; the approved snapshot is the only source shown publicly; cards show at most three attributes; products without specifications show none (never invented). This is also the prerequisite for matching approved supplier products by validated attributes.
5. **P1, reachability and operations.** Messages list for buyer and supplier, supplier unread state, admin Unpublish and admin Companies status control. *Acceptance:* a conversation opens in two clicks from either sidebar; marking read is an explicit, idempotent, company-scoped mutation; unpublish removes the product from public pages after the snapshot refresh and writes an audit row; a suspended company disappears from public pages and new leads, while its history is kept.

## I. Evidence and limitations
**Official sources (observed 2026-11-16, public pages only, no login):** https://www.indiamart.com/ (read); https://dir.indiamart.com/ (partial: about 40k of 286k characters verbatim); https://dir.indiamart.com/impcat/cotton-fabric.html (read; used because `https://dir.indiamart.com/search.mp?ss=cotton+fabric` failed twice with "stream has been aborted", so the **search-results page, its filters and sort controls are NOT verified**); https://www.indiamart.com/proddetail/plain-cotton-fabric-23205079862.html (read); https://www.indiamart.com/proddetail/ (read, a latest-products listing); https://www.indiamart.com/geetharamani-mills/ (read); https://help.indiamart.com/ and its Buying/Selling category pages (read, titles only); https://buyer.indiamart.com/ (sign-in page only; `my.indiamart.com` redirects there); https://seller.indiamart.com/ (about 275 characters of content, **seller landing not verified**); the Post Your Requirement link (sign-in gate, **form fields not verified**).
**Not verified at all:** the requirement form, buyer and seller dashboards, Lead Manager/BuyLeads behaviour, messaging, quotations, what each "Get Price/Contact Supplier" button does, and any search filter.
**Finbyn evidence:** TRACED in code: the route inventory (`src/app/**/page.tsx`: 60+ pages, 164 API routes), `supplierNav.ts`, `buyerNav.ts`, header search selector, `ProductCard`/`ProductPurchase` CTAs, `requirements/service.ts` (no readers), approved-product loader, lead distribution, conversations. TESTED: 36 unit and source-regression scripts pass; public routes returned 200 on the live site and protected routes redirected (HTTP, 2026-11-13 and 2026-11-16); six public journey pages were clean in the responsive audit. **Not verified:** every authenticated flow, all four integration suites (blocked, no isolated database), accessibility tooling beyond the audit tool's checks, performance, and any visual comparison (no screenshots were taken, and none were needed for a feature audit).
**Limits of inference:** CTA naming differences, response-rate and tier badges and the funnel order are inference from labels, not documented IndiaMART policy. The Finbyn automatic DIRECT + MATCHED rule is Finbyn's own requirement; no official source states IndiaMART's internal distribution policy, and none is claimed.
