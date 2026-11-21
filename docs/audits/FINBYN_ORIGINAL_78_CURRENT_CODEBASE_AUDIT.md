# Finbyn Mart: Original 78-Page Plan vs Current Codebase (read-only audit)

- Audit date: 2026-11-20
- Commit: `6716214c0a279170a076c3948e7a62733bdd4a3c` (branch `main`). Uncommitted changes: YES. `git status --short` listed 181 entries before this report was written (modified and untracked files, including the Pages 10, 13, 16, 17, 32, 52-55, 57, 75 work). This audit judged the working tree, not the commit.
- Scope rule: inspection only. No application code, config, database, tracker, CLAUDE.md or other doc was changed. The only file created is this report.

## 1. Sources inspected

- Plan: `docs/PAGE_TRACKER.md` baseline tables (IDs 01-78, Portal column, Aliases, owner-PRD crosswalk, IDs 79-117). It is the only authoritative statement of the original 78 that I found; `docs/audits/FINBYN_ORIGINAL_78_PAGE_STATUS.md` (2026-11-16) uses the same IDs. No second plan with different IDs or names was found, so no entry is marked Plan Conflict. Internal inconsistencies of the tracker are in section 8.
- Code: every `page.tsx` under `src/app` (88 files), `src/app/layout.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `src/app/[page]/page.tsx`, `src/app/admin/layout.tsx`, `src/app/supplier/layout.tsx`, `next.config.ts` (headers and images only: it has NO redirects or rewrites), `src/lib/auth/guards.ts` and `portals.ts`, `AdminShell.tsx`, `supplierNav.ts`, `buyerNav.ts`, `src/lib/constants/footer.ts`, the main workspace component each page imports (size and fetch/handler presence), `src/lib/catalog/*` imports, `src/lib/support/rules.ts` and `/api/support/requests`.
- No `middleware.ts` or `proxy.ts` exists (checked at root and `src/`). Route protection is per page/layout through `requireBuyerPage` / `requireSupplierPage` / admin guards.
- Depth caveat: I read the page file and checked the imported component, its size and whether it calls an API for every row. I did NOT read every line of every component. "Built" means the intended screen and its main interactions exist in source; it does not mean tested.
- Older audits and the tracker were used only as a map. Disagreements with current source are listed in section 8.

## 2. Classification definitions

- A Built: the intended screen and main interactions are implemented in source. Backend/runtime readiness is a separate column. A static or draft-content page counts as Built if the screen is complete; content approval is reported separately.
- B Partially Built: a real route exists but a named essential section, action or data source is missing.
- C Placeholder: generic template, "not published", sample-only shell.
- D Not Built: no route and no covering page.
- E Covered by Existing Page: the intended function is delivered by another real page/component (named). A redirect alone does not count.
- F Plan Conflict: sources disagree on the entry. None found.

## 3. Runtime evidence actually obtained

The brief said nothing is running, but `localhost:3000` answered. I made harmless GET requests only (status code, plus a text grep on two bodies). No browser, no build, no login, no database.

| GET | Result |
|---|---|
| `/`, `/about-us`, `/contact-us`, `/faqs` | 200 |
| `/help` | 200, body contains "isn't published yet" (placeholder confirmed) |
| `/industries/manufacturing` | 200, body contains "aren't set up yet" (empty state confirmed) |
| `/unauthorized`, `/maintenance`, `/admin/login`, `/supplier/leads`, `/super-admin/admins` | 404 (no route) |
| `/buyer/dashboard`, `/admin` | 307 to `/sign-in?next=...` (destination kept) |
| `/forbidden` anonymous | 307 to `/sign-in` (no `next`, acceptable: it carries no destination of its own) |

Everything else in the Runtime column is "Not verified" (code only). Authenticated pages, forms, APIs, responsive and accessibility were not exercised.

## 4. The 78-row matrix

Columns: Frontend verdict is the first word of "What Is Implemented". Runtime: "NV" = Not verified (code inspected only); "Blocked" = the integration suite for it cannot run (no isolated test database, per CLAUDE.md); "GET" = see section 3.

| ID | Page | Portal | Planned route | Actual / covering route | Status | What is implemented | What is missing | Backend | Navigation | Runtime | Source evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Homepage | PUBLIC | `/` | `/` | B | FE Partial. Ten sections render: hero + search, trust band, categories, requirement banner, featured products, featured suppliers, how it works, network banner, industries, testimonials | Featured Products and Featured Suppliers read hard-coded sample constants (flagged as sample in code); testimonials are "Sample Buyer One/Two" shown "for layout only"; "10L+ Verified Suppliers / 50L+ Products" are unsupported claims (CLAUDE.md forbids fake data presented as real); homepage sections for approved supplier products not built | Connected for search/categories; sample for 3 sections | Linked | GET 200 | `src/app/page.tsx:1-27`; `src/lib/constants/featuredProducts.ts:1-14`, `suppliers.ts`, `testimonials.ts:1-12`, `trust.ts:25-33`; `IndiaNetworkBanner.tsx:63` |
| 02 | All Categories | PUBLIC | `/categories` | `/categories` | A | FE Complete. Hero + `CategoryExplorer` over `getCategoryDirectory()` | none identified | Not required (reads catalog + approved snapshot) | Linked | NV | `src/app/categories/page.tsx`; `src/lib/catalog/categories.ts`; `src/app/categories/error.tsx` |
| 03 | Category Details | PUBLIC | `/categories/[slug]` | same | A | FE Complete. Shared `CategoryListingPage` with filters, sort, pagination | none identified | Connected (listing engine; inquiry/wishlist writes) | Linked | NV | `src/app/categories/[slug]/page.tsx`; `src/components/category/CategoryListingPage` |
| 04 | Products | PUBLIC | `/products` | same | A | FE Complete. Shared listing view with search, facets, `GET /api/public/products` | Brand, availability, popularity sorts have no data | Connected | Linked | NV | `src/app/products/page.tsx`; `src/lib/catalog/categoryListing.ts` |
| 05 | Product Details | PUBLIC | `/products/[slug]` | same | A | FE Complete. Detail section, tabs, related products, inquiry form, recently-viewed recorder | none identified | Connected (inquiry write; MongoDB) | Linked | NV | `src/app/products/[slug]/page.tsx:5-10`; `src/lib/catalog/productDetail.ts` |
| 06 | Suppliers | PUBLIC | `/suppliers` | same | A | FE Complete. `SupplierListingView` over `supplierListing` | Seller data is fictional catalog data (flagged in docs/MISSING_ASSETS.md); logos/ratings absent | Connected; data test/research | Linked | NV | `src/app/suppliers/page.tsx`; `src/lib/catalog/supplierListing.ts` |
| 07 | Supplier Profile | PUBLIC | `/suppliers/[slug]` | same + `/certifications`, `/products`, `/reviews` tabs | A | FE Complete. Header, tabbed profile, supplier-company profiles (`c-<id>`) | Reviews/certifications depend on data that is mostly absent (not verified how tabs render empty) | Connected | Linked | NV | `src/app/suppliers/[slug]/page.tsx:4-11` |
| 08 | Search Results | PUBLIC | `/search` | same | A | FE Complete. Shared listing engine, related searches, bounded rate limit | none identified | Connected | Linked (header search) | NV | `src/app/search/page.tsx` (185 lines); `publicProduct.ts` |
| 09 | Industries | PUBLIC | `/industries` | same | A | FE Complete. Tile grid linking to every industry | Industry list is a code constant (sample) | Not required | Linked | NV | `src/app/industries/page.tsx`; `src/lib/constants/industries.ts` |
| 10 | Industry Details | PUBLIC | `/industries/[slug]` | same | B | FE Complete in code: hero, shared listing, filters, five distinct states | **No industry-to-category mapping is APPROVED** (all entries PROPOSED), so every industry shows "products aren't set up yet" and no product ever lists; Suppliers tab omitted | Connected in code (`getIndustryListing`) | Linked | GET 200 + empty state confirmed | `src/app/industries/[slug]/page.tsx:1-60`; `src/lib/constants/industryCategories.ts:6-34` |
| 11 | Post Requirement | PUBLIC | `/post-requirement` | same | A | FE Complete. Structured form -> `POST /api/requirements` -> canonical inquiry | Specs only for the textile set | Connected; runtime Blocked | Linked (header, banner, footer) | Blocked | `src/app/post-requirement/page.tsx`; `src/app/api/requirements/route.ts` |
| 12 | How It Works | PUBLIC | `/how-it-works` | same | B | FE Partial. Breadcrumb plus the homepage four-step band only (re-used `HowItWorks` section) | No dedicated content: nothing for suppliers, no CTAs, no FAQs; one-sentence step text | Not required | Linked | NV | `src/app/how-it-works/page.tsx:1-20`; `src/lib/constants/process.ts` |
| 13 | About Us | PUBLIC | `/about-us` | same | A | FE Complete. Static server page: hero, purpose items, buyer/supplier cards, steps, CTAs, typed copy module | Copy is DRAFT, awaiting business approval (content status: not approved); no facts invented | Not required | Linked | GET 200 | `src/app/about-us/page.tsx` (145 lines); `src/lib/constants/aboutUs.ts` |
| 14 | Contact Us | PUBLIC | `/contact-us` | same | A | FE Complete. `ContactForm` validates and posts to `POST /api/support/requests` (rate limited, saved with reference; message says nobody is notified) | No e-mail/notification (stated honestly); tracker still calls it a placeholder | Connected in code | Linked | GET 200; submit NV | `src/app/contact-us/page.tsx`; `src/components/support/ContactForm.tsx:54-66`; `src/app/api/support/requests/route.ts` |
| 15 | Help Center & FAQs | PUBLIC | `/help` (alias `/faqs`) | `/help` and `/faqs` both served by generic `src/app/[page]/page.tsx` | C | Honest "not published yet" template | Entire page: FAQ content, search, contact links. (Published how-to FAQs and channels already exist for the buyer portal in `src/lib/support/faq.ts` / `channels.ts` but no public page uses them) | Missing | Linked from footer (header/footer) | GET 200 + placeholder text confirmed | `src/app/[page]/page.tsx:18-60`; `src/lib/constants/footer.ts:26,43` |
| 16 | Privacy Policy | PUBLIC | `/privacy-policy` | same | A | FE Complete. Static article, 11 sections, contents list, draft notice and noindex unless `PRIVACY_POLICY_EFFECTIVE_DATE` set | Content NOT approved or legally reviewed; effective date set only in local `.env.local` (not read by me; per tracker); operator name, contact, retention and process decisions open | Not required | Linked (footer) | NV | `src/app/privacy-policy/page.tsx` (110); `src/lib/constants/privacyPolicy.ts` |
| 17 | Terms & Conditions | PUBLIC | `/terms-and-conditions` | same | A | FE Complete. Static draft article, 11 sections, draft notice + noindex until `TERMS_EFFECTIVE_DATE` | Content NOT approved or reviewed; publication blocked on business/legal decisions | Not required | Linked (footer) | NV | `src/app/terms-and-conditions/page.tsx` (113); `src/lib/constants/termsContent.ts` |
| 18 | Sign In | PUBLIC | `/sign-in` | same (aliases `/login/buyer`, `/login/supplier` redirect here) | A | FE Complete. `SignInForm`, `safeNext` destination kept, role-resolved landing path | none identified | Connected (MongoDB, sessions) | Linked | NV (redirects with `next` seen in GET) | `src/app/sign-in/page.tsx:15-23`; `src/lib/auth/portals.ts` |
| 19 | Sign Up (Buyer) | PUBLIC | `/sign-up` | `/sign-up` re-exports `/register/buyer` page; `/register` redirects | A | FE Complete. Buyer registration form | Duplicate route by design | Connected | Linked | NV | `src/app/sign-up/page.tsx:2`; `src/app/register/buyer/page.tsx` |
| 20 | Register as Supplier | PUBLIC | `/register-supplier` | same | A | FE Complete. `SupplierRegisterForm` | Creates account only; company is created elsewhere | Connected | Linked | NV | `src/app/register-supplier/page.tsx` |
| 21 | Forgot Password | PUBLIC | `/forgot-password` | same | A | FE Complete. `RecoveryForms` | E-mail delivery cannot work without a provider | Connected; delivery Blocked | Linked (sign-in) | Blocked | `src/app/forgot-password/page.tsx` |
| 22 | Reset Password | PUBLIC | `/reset-password` | same | A | FE Complete. Token states, checklist | E-mail provider absent | Connected; Blocked | Via e-mail link | Blocked | `src/app/reset-password/page.tsx` |
| 23 | Buyer Dashboard | BUYER | `/buyer/dashboard` | same | A | FE Complete. KPI, trend, categories, per-section errors | Quotations/orders KPIs depend on modules shown honestly as unavailable where absent | Connected | Linked (nav, post-login) | GET 307 to sign-in with `next` | `src/app/buyer/dashboard/page.tsx`; `src/lib/buyer/dashboard.ts` |
| 24 | Buyer Profile | BUYER | `/buyer/profile` | same | A | FE Complete. Personal, company, documents, verification, security tabs | Mobile OTP, email change, photo not built (honest) | Connected | Linked | NV | `src/app/buyer/profile/page.tsx`; `src/components/buyer/profile/` |
| 25 | My Requirements | BUYER | `/account/requirements` | Covered by `/buyer/inquiries` and `/buyer/inquiries/[reference]` | E | General Requirements are the same canonical inquiry (`sourceType: GENERAL_REQUIREMENT`) and appear in the buyer list labelled "General Requirement" and "Matching suppliers" with their own detail view | No requirements-only filter or separate screen; legacy `requirements` collection no longer written | Connected | Linked (Post Requirement -> inquiries) | NV | `src/lib/inquiries/buyerList.ts:48,67,72`; `src/components/buyer/inquiries/detail/InquiryDetailView.tsx:16,92,166` |
| 26 | My Inquiries | BUYER | `/buyer/inquiries` (planned `/account/inquiries`, now a 308 redirect) | `/buyer/inquiries` | A | FE Complete. Table, tabs with counts, filters, sorts, pagination, cancel | Replies/quotations counts depend on supplier-side data | Connected | Linked | NV | `src/app/buyer/inquiries/page.tsx`; `InquiriesWorkspace.tsx` (342) |
| 27 | Inquiry Details | BUYER | `/buyer/inquiries/[reference]` | same | A | FE Complete. Overview, timeline, supplier, history, cancellation, conversation, print | Attachments, read receipts absent (stated) | Connected | Linked | NV | `src/app/buyer/inquiries/[reference]/page.tsx`; `InquiryDetailView.tsx` |
| 28 | Quotations Received | BUYER | `/buyer/quotations` | same | A | FE Complete. List, tabs, search, sort, compare selection, accept/reject/revise | PDF, attachment download | Connected | Linked | NV | `src/app/buyer/quotations/page.tsx`; `QuotationsWorkspace.tsx` (307) |
| 29 | Compare Quotations | BUYER | `/buyer/quotations/compare` | same | A | FE Complete. 2-4 quotations of one inquiry | none identified | Connected | Linked from list | NV | `src/app/buyer/quotations/compare/page.tsx` |
| 30 | Saved Products | BUYER | `/buyer/saved-products` | same (planned `/account/wishlist`) | A | FE Complete. Tabs, search, sorts, grid/list, remove, Get Quote | Multi-select compare not built | Connected | Linked | NV | `src/app/buyer/saved-products/page.tsx`; `SavedProductsWorkspace.tsx` (274) |
| 31 | Saved Suppliers | BUYER | `/buyer/saved-suppliers` | same | A | FE Complete. Filters, summary, bulk remove, compare-suppliers | Logos, ratings absent | Connected | Linked | NV | `src/app/buyer/saved-suppliers/page.tsx`; `SavedSuppliersWorkspace.tsx` (420) |
| 32 | Recently Viewed | BUYER | `/buyer/recently-viewed` | same | A | FE Complete. List, remove one, clear with confirm, retry, cursor paging; recorder on product page | Privacy Policy text not yet updated for this storage | Connected; persistence/isolation Blocked | Linked (sidebar) | Blocked | `src/app/buyer/recently-viewed/page.tsx:1-47`; `src/components/buyer/recent/RecentlyViewedWorkspace.tsx`; `buyerNav.ts:25` |
| 33 | Account Settings | BUYER | `/account/settings` | Covered by `/buyer/settings` (tab Settings) | E | Security, notification preferences, dashboard period preference on one real page | none beyond tracker's documented blocked items (2FA etc.) | Connected | Linked | NV | `src/app/buyer/settings/page.tsx`; `src/components/buyer/settings/` |
| 34 | Notifications | BUYER | `/account/notifications` | Covered by `/buyer/settings?tab=notifications` + bell | E | Notification centre (filters, mark read), bell popup | none | Connected | Linked | NV | `NotificationCenter.tsx` (218); `src/components/buyer/settings/` |
| 35 | Supplier Dashboard | SUPPLIER | `/supplier/dashboard` | same | A | FE Complete. Company card, period selector, KPI cards, chart, recent inquiries, top products | Response time not available (stated); needs a linked seller for non-zero data | Connected | Linked | NV | `src/app/supplier/dashboard/page.tsx`; `SupplierDashboard.tsx` (272) |
| 36 | Company Profile | SUPPLIER | `/supplier/company` | same (`/supplier/profile` redirects) | A | FE Complete. Five tabs: company, contact, KYC documents, verification, security | Media tab, draft/moderation of profile not built | Connected | Linked | NV | `src/app/supplier/company/page.tsx` (106); `SupplierProfileTabs.tsx:11-19` |
| 37 | Business Details | SUPPLIER | `/supplier/business-details` | Covered by `/supplier/company` Company Details tab | E | `SupplierCompanyForm` edits business identity fields in a real tab | No separate page | Connected | Linked (Company Profile) | NV | `SupplierProfileTabs.tsx:15`; `SupplierCompanyForm.tsx` |
| 38 | Verification / KYC | SUPPLIER | `/supplier/verification` | Covered by `/supplier/company` KYC Documents + Verification tabs (reviewed at `/admin/verification`) | E | Document upload panel; verification submission/status panel | Policy config `VERIFICATION_POLICY` has no default, so submission is refused until set | Connected; Blocked | Linked | Blocked | `SupplierDocumentsPanel.tsx`; `SupplierVerificationPanel.tsx` |
| 39 | Product Management | SUPPLIER | `/supplier/products` | same | A | FE Complete. KPI cards, filters, sort, search, catalogue + custom products | Loads the company's whole product set per request (perf, tracker M-06) | Connected | Linked | NV | `src/app/supplier/products/page.tsx`; `SupplierProductsWorkspace.tsx` (338) |
| 40 | Add Product | SUPPLIER | `/supplier/products/new` | same | A | FE Complete for the approved slice. Draft create/save, image upload (ImageKit route), textile specifications, review, submit/withdraw for moderation | Price tiers, variants, initial stock; specifications only for Apparel & Fashion | Connected; Blocked | Linked | Blocked | `src/components/supplier/products/ProductDraftForm.tsx:4-12,166-185`; `src/lib/media/imagekit.ts` |
| 41 | Edit Product | SUPPLIER | `/supplier/products/[id]/edit` | `/supplier/products/[productReference]/edit` | A | FE Complete. Same form for own drafts | Catalogue/legacy products not editable (by design) | Connected | Linked from list | NV | `src/app/supplier/products/[productReference]/edit/page.tsx` |
| 42 | Inventory | SUPPLIER | `/supplier/inventory` | same | A | FE Complete. Ledger positions, adjustments, idempotent | Locations, alerts, export, reconciliation | Connected | Linked | NV | `SupplierInventoryWorkspace.tsx` (285, 4 fetch calls) |
| 43 | Lead Management | SUPPLIER | `/supplier/leads` | Covered by `/supplier/inquiries?kind=matched` (Matching leads tab with count) | E | Inbox tab for matched leads, redacted recipient view, recipient-scoped status | No separate leads screen; `/supplier/leads` is 404 | Connected; Blocked | Linked (Inquiries & Leads) | `/supplier/leads` GET 404; rest Blocked | `SupplierInboxWorkspace.tsx:61,81`; `src/lib/leads/access.ts` |
| 44 | Buyer Inquiries | SUPPLIER | `/supplier/inquiries` | `/supplier/inquiries` + `/supplier/inquiries/[inquiryReference]` | A | FE Complete. Inbox with filters, detail, responses/clarifications, quote initiation | Same page as tracker ID 108 (duplicate row) | Connected | Linked | NV | `src/app/supplier/inquiries/page.tsx`; `SupplierInboxWorkspace.tsx`; `ResponsePanel.tsx` |
| 45 | Quotation Management | SUPPLIER | `/supplier/quotations` | same + `/create`, `/[reference]` | A | FE Complete. List, KPI, tabs, filters, export, details with versions, create/revise/submit, withdraw | PDF, attachments; submit blocked until `QUOTATION_TAX_RULES` is configured | Connected; Blocked | Linked | NV | `SupplierQuotationsWorkspace.tsx` (472); `src/app/supplier/quotations/create/page.tsx` |
| 46 | Subscription & Membership | SUPPLIER | `/supplier/subscription` | none | D | Nothing | Entire page (deferred: subscriptions) | Missing | Not linked | NV | no route; absent from `supplierNav.ts` |
| 47 | Analytics | SUPPLIER | `/supplier/analytics` | same | A | FE Complete. Live-record metrics, trend, top products, accessible chart + table, CSV export | Comparison periods, response-time/conversion, product views | Connected | Linked | NV | `SupplierAnalyticsWorkspace.tsx` (174) |
| 48 | Supplier Settings | SUPPLIER | `/supplier/settings` | same | A | FE Complete. Inquiry, quotation, order alerts (all available, in-app), channel capabilities, link to account security | E-mail/SMS and marketing e-mail not available (shown disabled with reason); no language/timezone | Connected | Linked | NV | `src/lib/supplier/settingsRules.ts:25-34`; `SupplierPreferencesForm.tsx` |
| 49 | Admin Login | ADMIN | `/admin/login` | Covered by `/sign-in` (admin role resolves to `/admin/inquiries`; `/admin` anonymous -> `/sign-in?next=%2Fadmin`) | E | One shared sign-in with server-side role routing; admin layout/pages refuse non-admins | No separate admin login; `/admin/login` is 404; admin accounts are operator-created in the database | Connected | Covered elsewhere | GET 404 / 307 seen | `src/lib/auth/portals.ts:29`; `src/app/admin/layout.tsx`; `src/app/admin/page.tsx:27` |
| 50 | Admin Dashboard | ADMIN | `/admin` | `/admin` | B | FE Partial. Capability-filtered launcher of eight tool cards | No KPIs, counts, queues or activity; it is a start page, not a dashboard | Connected (permissions) | Linked (shell logo goes to `/admin/inquiries`) | GET 307 | `src/app/admin/page.tsx:12-41` |
| 51 | Buyer Management | ADMIN | `/admin/buyers` | none | D | Nothing | Entire page | Missing | Not linked | NV | no route; absent from `AdminShell` NAV |
| 52 | Supplier Management | ADMIN | `/admin/suppliers` | same | A | FE Complete. List, filters, drawer, audited suspend/reactivate, export | Runtime Blocked | Connected; Blocked | Linked | Blocked | `AdminSuppliersWorkspace.tsx`, `AdminSupplierReview.tsx` |
| 53 | Supplier Verification | ADMIN | `/admin/verification` | same | A | FE Complete. Queue, exact-revision review, private evidence, approve/changes/reject | Refuses approval until `VERIFICATION_POLICY` is configured | Connected; Blocked | Linked | Blocked | `AdminVerificationWorkspace.tsx`, `AdminVerificationReview.tsx` |
| 54 | Product Management | ADMIN | `/admin/products` | same (+ `/admin/product-review` moderation) | A | FE Complete. List, drawer, unpublish with reason, export | No republish; legacy CSV catalogue not manageable | Connected; Blocked | Linked | Blocked | `AdminProductsWorkspace.tsx` (332) |
| 55 | Category Management | ADMIN | `/admin/categories` | same | B | FE Partial. Hierarchy browse, filters, impact review, activation of MAIN categories | Create, rename, change parent/slug, activation below main category (categories are code-defined) | Connected; Blocked | Linked | Blocked | `AdminCategoriesWorkspace.tsx`; docs/admin/PAGE_55_CATEGORY_MANAGEMENT.md |
| 56 | Requirement Management | ADMIN | `/admin/requirements` | Covered by `/admin/inquiries` (source filter "general" = General Requirements) | E | Source, lifecycle, distribution and recipient views, audited routing repair and pause/resume | No separate requirements page | Connected; Blocked | Linked | Blocked | `src/lib/admin/inquiryRules.ts:6,40,152`; `AdminInquiriesWorkspace.tsx` |
| 57 | Inquiry Management | ADMIN | `/admin/inquiries` | same | A | FE Complete. Filters, review drawer, recipients, audited actions, export | Moderation not offered (no policy) | Connected; Blocked | Linked | Blocked | `AdminInquiriesWorkspace.tsx` (194), `AdminInquiryReview.tsx` (343) |
| 58 | Quotation Management | ADMIN | `/admin/quotations` | none | D | Nothing (sidebar item "Soon") | Entire page | Missing | Disabled sidebar item | NV | `AdminShell.tsx:23` (`built: false`) |
| 59 | Subscription Management | ADMIN | `/admin/subscriptions` | none | D | Nothing | Entire page (deferred) | Missing | Disabled "Soon" | NV | `AdminShell.tsx:24` |
| 60 | Payments | ADMIN | `/admin/payments` | none | D | Nothing | Entire page (deferred; no payment source) | Missing | Disabled "Soon" | NV | `AdminShell.tsx:25` |
| 61 | Reports | ADMIN | `/admin/reports` | none | D | Nothing | Entire page | Missing | Disabled "Soon" | NV | `AdminShell.tsx:26` |
| 62 | Notifications | ADMIN | `/admin/notifications` | none | D | Nothing | Entire page | Missing | Disabled "Soon" | NV | `AdminShell.tsx:27` |
| 63 | Content Management | ADMIN | `/admin/content` | none | D | Nothing | Entire page | Missing | Disabled "Soon" | NV | `AdminShell.tsx:28` |
| 64 | Settings | ADMIN | `/admin/settings` | none | D | Nothing | Entire page | Missing | Disabled "Soon" | NV | `AdminShell.tsx:29` |
| 65 | Audit Logs | ADMIN | `/admin/audit-logs` | none | D | No page. `admin_audit_log` rows are written by admin actions and shown only inside drawers' activity tabs | A global audit-log viewer | Partial (data exists, no page) | Disabled "Soon" | NV | `AdminShell.tsx:30`; no `src/app/admin/audit-logs` |
| 66 | Admin Management | ADMIN | `/super-admin/admins` | none | D | Nothing | Entire page (deferred super-admin) | Missing | Not linked | GET 404 | no `src/app/super-admin` |
| 67 | Roles & Permissions | ADMIN | `/super-admin/roles` | none | D | Nothing (permissions are a code list, `ADMIN_CAPABILITIES`) | Entire page | Missing | Not linked | NV | `src/lib/admin/permissions.ts:9` |
| 68 | Platform Configuration | ADMIN | `/super-admin/config` | none | D | Nothing | Entire page | Missing | Not linked | NV | none |
| 69 | Subscription Plans | ADMIN | `/super-admin/plans` | none | D | Nothing | Entire page (deferred) | Missing | Not linked | NV | none |
| 70 | Financial Overview | ADMIN | `/super-admin/finance` | none | D | Nothing | Entire page (deferred) | Missing | Not linked | NV | none |
| 71 | Global Analytics | ADMIN | `/super-admin/analytics` | none | D | Nothing | Entire page | Missing | Not linked | NV | none |
| 72 | Security Logs | ADMIN | `/super-admin/security-logs` | none | D | Nothing | Entire page | Missing | Not linked | NV | none |
| 73 | Platform Settings | ADMIN | `/super-admin/platform-settings` | none | D | Nothing | Entire page | Missing | Not linked | NV | none |
| 74 | 404 Not Found | PUBLIC | `not-found.tsx` | `src/app/not-found.tsx` | A | FE Complete. Branded message with three links | none identified | Not required | n/a (automatic) | GET 404 seen on unknown routes (page content not read) | `src/app/not-found.tsx:1-30` |
| 75 | 500 Error | PUBLIC | `error.tsx / global-error.tsx` | `src/app/error.tsx` (15 lines), `src/app/global-error.tsx` (18 lines) | A | FE Complete. Try Again, home and contact links, no stack/message shown | Authenticated-portal failure paths and streamed failures unverified | Not required | n/a | NV (not forced) | `src/app/error.tsx`, `global-error.tsx`; docs/page-designs/PAGE_75_ERROR_HANDLING.md |
| 76 | Unauthorized (401) | PUBLIC | `/unauthorized` | none (anonymous visitors are redirected to `/sign-in?next=`, which is functionally a 401 handler, but no page exists and the plan names a page) | D | Nothing | A page; or an owner decision that sign-in redirect replaces it (then re-label E) | n/a | n/a | GET 404 | no `src/app/unauthorized`; `src/lib/auth/guards.ts:26` |
| 77 | Forbidden (403) | PUBLIC | `/forbidden` | same | A | FE Complete. Role-aware "Access Denied" with return to the account's own portal; anonymous -> sign-in | Answers HTTP 200 rather than 403 (documented choice) | Connected (session) | Reached by guard redirects | GET 307 for anonymous; signed-in render NV | `src/app/forbidden/page.tsx:1-43`; `guards.ts:29` |
| 78 | Maintenance | PUBLIC | `/maintenance` | none | D | Nothing; no maintenance flag or mode found in `src` | Entire page and a switch | Missing | n/a | GET 404 | no route; grep for "maintenance" in `src` finds only the distribution route and guards |

## 5. Reconciled counts

| Status | Count | IDs |
|---|---:|---|
| A Built | 44 | 02-09, 11, 13, 14, 16-24, 26-32, 35, 36, 39-42, 44, 45, 47, 48, 52-54, 57, 74, 75, 77 |
| B Partially Built | 5 | 01, 10, 12, 50, 55 |
| C Placeholder | 1 | 15 |
| D Not Built | 20 | 46, 51, 58-73, 76, 78 |
| E Covered by Existing Page | 8 | 25, 33, 34, 37, 38, 43, 49, 56 |
| F Plan Conflict | 0 | none |
| Total | 78 | 44+5+1+20+8+0 = 78 |

Judgement calls (so you can overrule them): 01 is B, not A, because three homepage sections are hard-coded sample content (and carry unsupported claims), not because a screen is missing. 40 is A because the approved draft/images/specs/submit slice is complete; its gaps are enhancements. 76 is D because no page exists; if the owner accepts the sign-in redirect as the 401 behaviour it becomes E. Built does not mean runtime-verified: many are Blocked (no isolated test database).

### Portal-wise (tracker Portal column)

| Portal | IDs | Total | A | B | C | D | E |
|---|---|---:|---:|---:|---:|---:|---:|
| PUBLIC | 01-22, 74-78 | 27 | 21 | 3 | 1 | 2 | 0 |
| BUYER | 23-34 | 12 | 9 | 0 | 0 | 0 | 3 |
| SUPPLIER | 35-48 | 14 | 10 | 0 | 0 | 1 | 3 |
| ADMIN | 49-73 | 25 | 4 | 2 | 0 | 17 | 2 |
| Sum | | 78 | 44 | 5 | 1 | 20 | 8 |

I disagree with the tracker's headline split (Public 20, Buyer 14, Supplier 14, Admin 17, Super Admin 8, System 5): that is the group heading of the baseline tables. Its own Portal column puts IDs 21-22 under PUBLIC and 74-78 under PUBLIC, giving 27/12/14/25 above (Admin includes the 8 super-admin pages).

## 6. Route counts and extras

- Page files: `find src/app -name page.tsx` = **88**. API `route.ts` files = 193 (not pages). Special files (`not-found.tsx`, `error.tsx`, `global-error.tsx`) are not counted as pages but carry IDs 74 and 75.
- Redirect-only page files (<= 20 lines, body is a redirect): **8**: `/account/inquiries` (308), `/buyer/compare` (308), `/category/[slug]`, `/login/buyer`, `/login/supplier`, `/register`, `/supplier`, `/supplier/profile`. `next.config.ts` has no redirects; all are page files.
- Not independent screens: `/sign-up` re-exports the `/register/buyer` page (duplicate render); `src/app/[page]/page.tsx` is one generic template serving 19 footer URLs (`/help`, `/faqs`, and 17 extras: blog, careers, press, success-stories, buyer-guide, safety-tips, supplier-membership, lead-management, pricing, supplier-guide, supplier-success-stories, track-inquiry, report-abuse, feedback, refund-policy, cookie-policy, disclaimer). It counts once and covers only original ID 15 (plus the alias `/faqs`).
- Duplicate/alias routes: `/sign-up` = `/register/buyer`; `/login/*` -> `/sign-in`; `/register` -> `/register/buyer`; `/supplier/profile` -> `/supplier/company`; `/category/[slug]` -> `/categories/[slug]`; `/faqs` and `/help` same template; `/buyer/compare` -> `/buyer/compare-products`; `/account/inquiries` -> `/buyer/inquiries`.
- Extra implemented pages outside the original 78 (no new original IDs; tracker IDs in brackets where it has one): `/sitemap` [79], `/categories/[slug]/[subcategory]` [97], `/password-reset/success` [98], `/buyer/addresses` [99], `/buyer/settings` [100, also covers 33/34], `/buyer/quotations/[reference]` [101], `/buyer/compare-products` [102], `/buyer/compare-suppliers`, `/buyer/orders` [103], `/buyer/orders/[reference]` [104], `/buyer/support` [105], `/buyer/support/tickets/[ticketReference]` [106], `/buyer/security` [107], `/supplier/inquiries/[inquiryReference]` [109], `/supplier/quotations/create` [110], `/supplier/quotations/[reference]` [111], `/supplier/orders` [112], `/supplier/orders/[reference]`, `/supplier/security` [113], `/supplier/support` and `/supplier/support/tickets/[ticketReference]` (no tracker row), `/admin/company-links` [114], `/admin/product-review` [115], `/admin/support` [116], `/verify-email`, `/verify-email/resend`, `/inquiry/[supplierSlug]`, `/inquiry/success/[reference]`, `/suppliers/[slug]/certifications|products|reviews`, `/register/buyer`. ID 117 is a cross-portal feature, not a page. Tracker IDs 80-96 are the unpublished placeholder URLs (not built).
- Unique implemented-screen count: **not reliably established.** A defensible rule exists (page files 88, minus 8 redirects, minus the `/sign-up` duplicate, minus the generic template = 78 distinct real screens, which treats dynamic tab routes and detail routes as screens) but it counts routes, not designs, and it coincidentally equals 78, which is not meaningful. I do not offer it as a headline number.

## 7. Remaining-work lists

A. No new page needed: every A row (44), pending QA/runtime only.

B. Existing pages needing completion (real gaps only):
- 01 Homepage: replace sample Featured Products/Suppliers with the central catalogue (or approved items), remove or approve Testimonials and the "10L+/50L+" claims.
- 10 Industry Details: owner must approve industry-to-category mappings; until then nothing lists.
- 12 How It Works: add a dedicated page body (buyer and supplier flows, CTAs).
- 50 Admin Dashboard: add real counts/queues (pending reviews, failed distributions, open tickets) on top of the launcher.
- 55 Category Management: create/rename/reparent/slug need a taxonomy-in-database migration first.

C. Original pages that genuinely need building (verified Not Built only): 15 (Placeholder, shown with the D list for content), 46, 51, 58, 59, 60, 61, 62, 63, 64, 65, 66-73, 76, 78. Of these, deferred by existing decisions: 46, 59, 60 (subscriptions, payments), 69, 70 and the super-admin set 66-73.

D. Placeholder content to replace: software: ID 15 `/help`/`/faqs`. Content writing (owner/business, not software): the 17 extra footer pages (blog, careers, press, guides, pricing, refund/cookie/disclaimer, etc.), approval of the About, Privacy and Terms drafts, real testimonials, removal or sourcing of homepage stats.

E. Backend/runtime gaps (not pages): no isolated test database, so every `it-*.mjs` integration suite is BLOCKED; no worker scheduler for lead distribution; e-mail provider absent (forgot/reset password, notifications, support); `QUOTATION_TAX_RULES` and `VERIFICATION_POLICY` unset by default; no deployment verified; no authenticated browser, responsive or accessibility run in this audit.

F. Extra implemented pages: see section 6 (no new original IDs proposed).

## 8. Tracker/older-audit discrepancies and proposed corrections (not applied)

- Row 14 Contact Us says "Placeholder template only"; `/contact-us` is a real form posting to `/api/support/requests`. Mark Development at least Implemented.
- Row 110 route is `/supplier/quotations/new`; the real route is `/supplier/quotations/create`.
- Row 45 note lists create/revise/submit as "not built / Page 43 does not exist"; they exist (row 110/111). Row 35 note lists replying, adding products, quotation creation as "Not available"; they exist. Row 48 note says inquiry/quotation/order alert controls are disabled; `settingsRules.ts` now marks them available. Rows 40/41 notes say image upload and publish are BLOCKED; image upload and submit-for-review are in `ProductDraftForm.tsx`.
- Rows 25, 33, 34, 37, 38, 43, 49, 56 are "Not Started" but are covered by existing pages (E above); record the covering route.
- Rows 49 and 50: `/admin` exists as a launcher, `/admin/login` does not; record "covered by `/sign-in`" and "Partial".
- Row 77: anonymous visit verified to redirect to sign-in; signed-in render still unverified.
- Portal ownership table (47/21/20/28) adds to 116, not the stated 117 (ID 117 is a cross-portal row); the baseline group headings (20/14/14/17/8/5) differ from the Portal column (27/12/14/25).
- The previous audit `FINBYN_ORIGINAL_78_PAGE_STATUS.md` (2026-11-16) is out of date: it lists 32 as Not Built (now Built), counts 81 page files (now 88), and states Industry Details renders an empty state for lack of a listing (listing code now exists; the empty state is now caused only by the unapproved mapping).
- `docs/FINBYN_COMPLETE_PROJECT_AUDIT.md` and `docs/audit/*` predate the supplier and admin portals and were not reconciled.

Other flags: no buttons without handlers were found in the spot-checked workspaces (each inspected workspace calls an API); unbuilt admin sidebar items render as disabled "Soon" spans, not broken links; supplier nav has no unbuilt items; footer links to 19 URLs that resolve to the "not published" template (not 404s, but dead ends); auth redirects keep the destination (`safeNext`); no tracker entry is marked Development Complete without code, but several Development "Complete" rows were not re-run here.

## 9. Recommended next task (one)

**Original ID 15, Help Center & FAQs, route `/help` (merge alias `/faqs`), a NEW page build (the only original Placeholder).**
- Why next: it is the only original public page that is still a placeholder; it is linked from the footer, it is where a signed-out visitor goes for help, and it needs no backend or approval dependency that blocks other work. Everything else open is either deferred (subscriptions, payments, super-admin), blocked on an owner decision (industry mapping, legal text), or not a missing screen.
- Exact work: replace the template for `help` and `faqs` with a real page: FAQ list from the repo-managed published entries in `src/lib/support/faq.ts` (how-to answers only, no payment/delivery/refund/fee/timing statements per CLAUDE.md), search/filter by category, contact options from `src/lib/support/channels.ts` (env-driven, show only what is configured), links to `/contact-us`, `/buyer/support` and `/supplier/support`, breadcrumb, one shared-component layout, remove the two slugs from the generic template list.
- Dependencies/decisions: owner approval of the FAQ wording; whether a public FAQ endpoint is wanted (a public FAQ API already exists per tracker row 105, to be confirmed at build time); no database needed. Runner-up if the owner prefers Core usability first: completing 01 (replace sample homepage sections, remove unsupported counts), which is a completion, not a new page.

## 10. Verification limitations

Not run: builds, `tsc`, lint, any test or integration suite, `next dev/start` (a server on :3000 was already up and received only status GETs and two text greps), any browser or responsive/zoom/accessibility check, any authenticated flow, any form submission, any database or API write, Lighthouse, Firefox/Safari/devices. `.env.local` was not read, so the effective-date statements for Privacy/Terms come from the tracker and code, not from the environment. I did not read every line of every component; Built rows rest on the route file, the imported component's size and API usage, and the service it calls. Counts are only as good as that depth; the largest uncertainty is whether a few A rows (06/07 tabs, 36, 39) have gaps visible only on reading deeper or running them.
