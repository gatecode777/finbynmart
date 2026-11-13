# Finbyn Mart: Supplier Portal Audit

**Audit date:** 2026-11-13 · **Branch:** `main` · **Commit:** `1919536` plus uncommitted working-tree changes made after it (admin inquiries, security page, settings and other edits) · **Method:** static code tracing plus the repository's own offline checks · **Scope:** every route under `src/app/supplier`, `src/app/api/supplier` and the services they call.

This is an audit report only. No application code, database record or `docs/PAGE_TRACKER.md` was changed. Older audit documents were treated as history; the current code is the authority.

---

## A. Executive summary

**The Supplier Portal is partially functional and not ready for normal use.** The code is broad and mostly well built: tenant isolation by company, server-calculated money, versioned quotations, an idempotent and transactional response/quotation write path, an inventory ledger, analytics and support tickets all exist as complete code paths. But a real supplier cannot do business in it today, for one structural reason and several smaller ones:

1. **A registered supplier can never be linked to a seller.** Every company is created with `sellerKeys: []` and no code, API or admin screen ever writes that list (`src/lib/supplier/company.ts:106`, `src/lib/supplier/profileService.ts:186`). All inquiries, quotations, orders and ratings reach a company only through `sellerKeys`, so for any real account they are permanently empty. The "No seller linked" message and the zero metrics are **accurate, not a bug**: they are the correct result of a missing administrative mapping workflow.
2. **Two verification endpoints are fake.** A supplier can mark their own e-mail verified with one request, and their phone verified with any 6-digit code (finding S-01, S-02). These are the most serious security findings.
3. **Nothing creates an order**, supplier-created products cannot reach public discovery (no moderation or publishing), and supplier notification events do not exist, so the quote-to-order-to-fulfilment half of the business has no working path.
4. Two dashboard messages are **stale** (replies and product management say "not built" although both exist).

Nothing was verified at runtime: no database, browser or server run was approved for this audit. Everything below marked "implemented" is a traced code path, not an exercised one.

**What passes automatically (run for this audit):** `npx tsc --noEmit` (0 errors), `npm run lint` (0 warnings), production build (compiled successfully, 16 s), and 28 offline unit-test scripts of which 26 pass fully and 2 fail on outdated assertions (see G).

---

## B. Module completion matrix

Status key: **VW** verified working · **INRV** implemented, not runtime verified · **PI** partially implemented · **NI** not implemented · **BL** blocked. No percentage is given: there is no agreed denominator, and design/PRD delivery is deliberately not counted as implementation. Runtime evidence is "none" everywhere except the automated checks listed in G.

| Module | Actual route | Frontend | API / service | Database | Workflow status | Runtime evidence | Dependencies | Priority |
|---|---|---|---|---|---|---|---|---|
| Dashboard | `/supplier/dashboard` | built | `dashboardService` + `/api/supplier/dashboard*` | reads inquiries, quotations, orders, reviews | INRV; metrics structurally 0 without mapping (D-01); stale messages (M-01) | none | seller mapping | High |
| Inquiries & Leads (list) | none (`supplierNav.ts:20`, href null) | **absent** | `/api/supplier/inquiries` is only the quotation picker | `inquiries` | NI | none | seller mapping | High |
| Inquiry details & responses | `/supplier/inquiries/[inquiryReference]` | built | `inquiryService`, `/responses`, `/activity` | `inquiries`, `inquiry_messages`, `notification_outbox`, `idempotency_keys` | INRV (transactional, idempotent by design) | none | seller mapping; reachable only by link | High |
| Quotations list | `/supplier/quotations` | built | `quotationService`, `/api/supplier/quotations*` | `quotations` | INRV | none | seller mapping | High |
| Create quotation | `/supplier/quotations/create` | built | `quoteService`, draft/submit routes | `quotations`, `idempotency_keys` | PI: submission BLOCKED until `QUOTATION_TAX_RULES` is configured (`taxConfig.ts`, not in `.env.example`) | none | seller mapping, tax config | High |
| Quotation details & versions | `/supplier/quotations/[reference]` | built | versions, compare, withdraw, revisions | `quotations`, `notification_outbox` | INRV | none | seller mapping | Medium |
| Orders | `/supplier/orders` | built (read-only) | `orderService`, `/api/supplier/orders*` | `orders` | PI: nothing creates orders (D-03) | none | order creation workflow | High |
| Order details & fulfilment | `/supplier/orders/[reference]` | built (read-only) | `/api/supplier/orders/[reference]` | `orders` | PI: no fulfilment actions exist | none | order creation | Medium |
| My Products | `/supplier/products` | built | `productService`, `/api/supplier/products` | `supplier_products` + CSV catalogue (in memory) | PI: lists catalogue plus custom; legacy create route is unsafe (D-04) | none | none | Medium |
| Add Product | `/supplier/products/new` | built | `productDraftService`, `/api/supplier/products/drafts*` | `supplier_products` (draft) | PI: draft only; no publish or moderation (D-02) | none | admin moderation | High |
| Edit Product | `/supplier/products/[productReference]/edit` | built | same draft APIs | `supplier_products` | PI: own drafts only, not catalogue or legacy products | none | admin moderation | Medium |
| Inventory | `/supplier/inventory` | built | `inventoryService`, `/api/supplier/inventory*` | `inventory_positions`, `inventory_movements` | PI: ledger works by design; no reservations, locations, approval, export | none | order creation | Medium |
| Analytics & Reports | `/supplier/analytics` | built | `analyticsService`, export | reads inquiries, quotations, orders | INRV; reports 0 without mapping | none | seller mapping | Low |
| Company Profile | `/supplier/company`, `/supplier/profile` | built (tabbed) | `profileService`, `/api/supplier/company*` | `users`, `supplier_companies`, documents | PI: persists; verification endpoints fake (S-01/S-02); no media, no moderation | none | admin verification | High |
| Settings & notification preferences | `/supplier/settings` | built | `settingsService` | `users.supplierSettings` | PI: all notice controls disabled, correctly (M-05) | none | notification producers | Low |
| Help & Support | `/supplier/support` | built | `/api/supplier/support/*` | `support_tickets` | PI: tickets created; no staff side | none | support staff tooling | Medium |
| Support ticket conversation | `/supplier/support/tickets/[ticketReference]` | built (shared buyer component) | buyer ticket routes via `supportGuard` | `support_messages` | INRV | none | support staff tooling | Medium |
| Account Security | `/supplier/security` (new) and Company tab "Security" (older) | built twice (M-07) | shared buyer module; older `securityService` | `auth_sessions`, `users` | INRV; older panel contains S-01/S-02 | none | none | High |

**Additional supplier routes found:** `/supplier` (redirect entry), `/supplier/profile` (alias of company), `/supplier/security`. API-only: `/api/supplier/quotation-products`, `/api/supplier/dashboard/performance`, `/api/supplier/notifications*`, `/api/supplier/support/related|summary`.

---

## C. Dashboard screenshot findings

| Message seen | Where in code | Actual code state | Accurate? | Business impact | Next action |
|---|---|---|---|---|---|
| "Inquiries & Leads: Soon" | `supplierNav.ts:20` | No `/supplier/inquiries` list page exists; only the detail page and the quotation picker API | **Accurate** | Suppliers can open an inquiry only from a dashboard or quotation link | Build the list page on a real list API (D-01 must be solved first) |
| "No seller linked to your company" | `dashboardService.ts` / `SupplierDashboard.tsx`, `company.ts:106` | `sellerKeys` is `[]` for every company and nothing writes it | **Accurate** (legitimate unlinked company **and** missing administrative mapping workflow). Not a wrong query, not stale, not a migration gap | Blocks every inquiry, quotation, order and rating for real suppliers | Admin workflow to link a seller to a company (see D-01) |
| "Add product: not built yet" | `SupplierDashboard.tsx:256`; flag hard-coded in `dashboardService.ts:296` (`productManagement: false`) | `/supplier/products/new` and draft APIs exist | **Stale** | Supplier is told a working feature is missing | Drive the flag from real capability |
| "Supplier replies are not built yet" | `SupplierDashboard.tsx:260`; `dashboardService.ts:296` (`responsesAvailable: false`) | `ResponsePanel.tsx` and `POST /api/supplier/inquiries/[reference]/responses` exist | **Stale** | Same | Same |
| "Product approval does not exist yet" | `dashboardService.ts:133` | No approval or moderation code anywhere | **Accurate** | Drafts cannot go live | Admin moderation module |
| "Company verification does not exist yet" | `SupplierDashboard.tsx:219`, `company.ts` (`UNVERIFIED` only) | No review workflow. The two self-verify endpoints (S-01/S-02) set e-mail/phone flags but not company verification | **Accurate**, but see S-01/S-02 | No trust badge possible | Admin verification module |
| "No event creates a notification for a supplier yet" | `dashboardService.ts:294` | Only a welcome notice is ever created (`notifications.ts:163-171`) | **Accurate** | No alerts for inquiries, quotation decisions or orders | Add producers after order/mapping work |
| Zero inquiries, quotations, orders, products | metric queries scoped by `sellerKeys` | `0` is the correct result of an empty `sellerKeys` (queries use `supplierKey ∈ sellerKeys`; with no keys the service returns zeros) | **Genuine zero, not a defect** | Hides the real blocker | Fix D-01; consider labelling the zero "no seller linked" instead of a bare 0 |

---

## D. Detailed issue register

Severity: **Critical** blocks launch or breaks security; **High** breaks a core workflow; **Medium** weakens correctness or defence in depth; **Low** hygiene. Every file reference is from the working tree on the audit date. All verification statuses are **INRV (code traced, not exercised)** unless stated.

### S-01 Supplier e-mail can be self-verified without a token: Critical
- **Role/module:** supplier, Company Profile → Security tab.
- **Files:** `src/lib/supplier/securityService.ts:154-180` (`verifySupplierEmail`), `src/app/api/supplier/security/verify-email/route.ts`, called from `SupplierSecurityPanel.tsx:85`.
- **Reproduce (safe, isolated test account only):** sign in as a supplier with an unverified e-mail; `POST /api/supplier/security/verify-email`.
- **Expected:** a one-time token sent to the address and checked (the buyer flow `/api/auth/verify-email` does this).
- **Actual:** the function sets `emailVerified: true` for the caller with no token or proof and records a "security alert" event.
- **Impact:** verification is meaningless; it also adds 15 points to profile completion (`dashboardRules.ts`) and any future trust rule that reads it.
- **Fix:** delete the endpoint and use the existing token flow.
- **Status:** INRV.

### S-02 Phone "OTP" accepts any 6-digit code and can overwrite the phone number: Critical
- **Files:** `securityService.ts:186-231` (`verifySupplierPhone`), `verify-phone/route.ts`.
- **Actual:** only the format `^\d{6}$` is checked (a comment says "demo/testing code 123456 or any 6-digit code"). No OTP is issued or stored. It also writes the submitted phone into `supplier.phone` and `phone`.
- **Impact:** false verified status and silent contact-data change.
- **Fix:** remove until a real OTP provider exists; never show "verified" without a delivered, stored, expiring, single-use code.
- **Status:** INRV.

### D-01 No way to link a seller to a company: Critical (go-live)
- **Files:** `company.ts:106` and `profileService.ts:186` create `sellerKeys: []`; no other write exists. `docs` and code comments say only "the platform" may link them. The admin portal built so far (Page 57) is read-only inquiries.
- **Reproduce:** register a supplier, open the dashboard.
- **Actual:** permanently "No seller linked"; inquiries (`supplierKey ∈ sellerKeys`), quotations, orders, ratings, analytics and the quotation picker are empty by construction.
- **Impact:** a registered supplier cannot receive a lead. This is the single biggest functional blocker.
- **Fix:** an authorized admin operation (capability-guarded, audited, one seller key to one company, reviewed against ownership evidence) that appends to `sellerKeys` after verification. Never self-claim; never auto-link seed sellers.
- **Status:** NI.

### D-02 Supplier products cannot reach public discovery: High
- **Evidence:** `supplier_products` is referenced only from `src/lib/supplier/*`; nothing under `src/lib/catalog`, `src/app/products`, `src/app/suppliers` or `src/app/api/public` reads it. No publish or moderation code exists.
- **Impact:** drafts stay private forever; "Review Listing" correctly says it cannot publish.
- **Fix:** an admin moderation workflow plus a publish transition feeding the same listing engine.
- **Status:** NI.

### D-03 Orders cannot be created: High
- **Evidence:** the only constructor is `buildOrderDoc` (`src/lib/orders/service.ts:96`) and it has no caller; quotation acceptance does not create an order (CLAUDE.md rule and code agree).
- **Impact:** Orders, Order details, inventory reservations, shipment and payment views are empty by design; the quote-to-cash path ends at acceptance.
- **Fix:** an approved order-confirmation workflow, once per quotation, carrying stored amounts.
- **Status:** NI.

### D-04 Legacy product create route still live and unsafe: High
- **Files:** `src/app/api/supplier/products/route.ts:27-63` (POST), `productService.ts:230` (`createSupplierProduct`).
- **Actual:** accepts client `price` (JSON number) and `stock`, derives an ACTIVE status; no UI calls it (searched `src/components`). It bypasses the inventory ledger and the draft rules, and has no cross-site check.
- **Impact:** a script or mistaken client can create "stocked" products outside the audited model.
- **Fix:** remove the POST handler.
- **Status:** INRV.

### M-01 Stale "not built" dashboard messages: Medium
- See C. `dashboardService.ts:296` hard-codes `responsesAvailable: false` and `productManagement: false`.

### M-02 No inquiries list page, and the list API is not an inquiries list: Medium
- `GET /api/supplier/inquiries` is `listQuotableInquiries` (registered buyers, not closed). Guest inquiries and closed ones never appear; there is no page to browse them.

### M-03 Missing origin check on several write routes: Medium
- Routes with writes but no `isCrossSiteWrite`/`readWrite`: `company`, `company/documents` and `[id]`, `profile`, `products` (legacy), `support/tickets`, `notifications/read-all` and `[id]/read`, `security/verify-email`, `security/verify-phone`. They rely on the session cookie being `SameSite=Lax` (`session.ts:56`), which blocks most cross-site POSTs, so this is defence-in-depth, not a demonstrated exploit. The quotation and response routes are covered through `readWrite` (`quoteHttp.ts:18-19`).
- **Fix:** add the shared check to each.

### M-04 Notification read routes have no rate limit: Low
- `notifications/read-all`, `notifications/[id]/read`.

### M-05 Supplier notifications: only a welcome notice exists: Medium
- `notifications.ts:163-171` is the only producer. Preference enforcement is in `notifySupplier` but dormant, so the Settings controls are disabled (correct and honest).

### M-06 Whole-company product reads per request: Medium
- `collectSupplierProducts` (`productService.ts:106`) loads all catalogue and custom products for the company on every call; used by the product list, inventory list (`inventoryService.ts:108`) and every adjustment (`:185`). Bounded by the company's own products today (sellerKeys limit 50) but not paginated in the database.

### M-07 Two parallel account-security implementations: Low
- The new `/supplier/security` uses the shared buyer module; the Company page "Security" tab still uses `securityService.ts` (which holds S-01/S-02). Merge or delete the older one.

### M-08 Two stale unit tests fail: Low
- `25-26-rules-unit-test.mjs` S-09 (settings defaults) and `27-list-rules-unit-test.mjs` S-07 (`REPLIES_CONNECTED` is now `true`, the test still expects `false`). The tests are outdated, not the code.

### M-09 `QUOTATION_TAX_RULES` undocumented in `.env.example`: Low (becomes blocker if unset)
- Quotation submission is blocked while it is unset (`taxConfig.ts`). Document it.

### M-10 Tracker rows are inconsistent: Low
- Rows 41 and 44 (not started) versus built pages; row 108 duplicates row 44; row 39 and 42 text describes removed behaviour. See proposed corrections below.

### L-01 No supplier verification, moderation or support-staff tooling: dependency, not a supplier defect
- Admin portal contains only read-only inquiry review (Page 57).

---

## E. Dependency map

| Supplier capability | Depends on | State |
|---|---|---|
| Receive inquiries, quote, see orders, ratings, analytics | Company–seller mapping (`sellerKeys`) | **Missing: D-01** |
| Appear in public search and supplier pages | Public catalogue integration of `supplier_products` | **Missing: D-02** |
| Publish a product, show a verified badge | Admin moderation and verification | **Missing** |
| See and fulfil orders, reserve and ship stock | Order creation workflow | **Missing: D-03** |
| Payment status, invoices | Payment ledger or provider | Not present (UI correctly says unavailable) |
| Alerts for new inquiries, decisions, orders | Notification producers, then channels (in-app only exists; no e-mail or SMS provider) | Producers missing |
| Buyer notice retry after a failed delivery | Background processing | No scheduler; retried only when the supplier opens a page (by design, documented in CLAUDE.md) |
| Support replies | Support staff tooling | Missing |
| Quotation submission | `QUOTATION_TAX_RULES` configuration | Configuration, not code |

---

## F. Prioritized completion plan

No dates or effort are estimated.

**1. Critical access and data-integrity**

| Dependency | Required change | Acceptance criteria | Priority |
|---|---|---|---|
| none | Remove self-verify e-mail and phone endpoints (S-01, S-02); reuse the token flow | No request marks a contact verified without a delivered one-time proof; profile completion no longer counts it | Critical |
| Admin portal | Authorized seller-to-company mapping operation (D-01) | A capability-guarded, audited action links exactly one seller key to a company; a supplier cannot self-claim; dashboard shows real data for a linked test seller in a throwaway database | Critical |
| none | Remove legacy `POST /api/supplier/products` (D-04) | Route returns 404/405; no client sets stock or price outside drafts and the ledger | High |

**2. Core workflow blockers**

| Dependency | Required change | Acceptance criteria | Priority |
|---|---|---|---|
| D-01 | Supplier Inquiries & Leads list page on a real list API (M-02) | Lists all inquiries addressed to owned sellers, paged, scoped, with tests for cross-company isolation | High |
| Quotation acceptance policy | Order-confirmation workflow (D-03) | One order per accepted quotation (unique `quotationReference`), stored amounts, visible to the right buyer and supplier only | High |
| Admin | Product moderation and publish (D-02) | A reviewed draft appears in the central listing engine; drafts never appear publicly before approval | High |
| Config | Document and set `QUOTATION_TAX_RULES` (M-09) | `.env.example` entry; submission works in a test environment | Medium |

**3. Missing integrations**

| Dependency | Required change | Acceptance criteria | Priority |
|---|---|---|---|
| D-01, D-03 | Supplier notification producers (M-05) | Committed inquiry, decision and order events create a deduplicated in-app notice; preferences suppress only the notice | Medium |
| none | Add origin check to remaining write routes (M-03) and rate limit notification reads (M-04) | Cross-site POST returns 403 on every write route | Medium |
| Staff side | Support staff tooling | A staff reply appears in the supplier's ticket; never simulated | Medium |

**4. UI and content corrections**

| Dependency | Required change | Acceptance criteria | Priority |
|---|---|---|---|
| none | Drive dashboard capability flags from real capability (M-01) | No "not built" text for features that exist; "no seller linked" is shown instead of bare zeros | Medium |
| none | Merge the two security UIs (M-07) | One implementation; the older panel removed | Low |
| none | Correct the tracker (below) | Rows reflect evidence | Low |

**5. Responsive and accessibility:** run the repository's `docs/responsive/tools/audit.mjs` across the supplier routes against a test server and fix findings. **Not yet run.** Priority: High before launch.

**6. Performance:** push product listing and search filters into the database instead of `collectSupplierProducts` (M-06); run `explain("executionStats")` on the new indexes in an approved environment. Priority: Medium.

---

## G. QA evidence and limitations

**Commands actually run (branch `main`, Windows, Node, no server or database):**

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | No warnings or errors |
| Production build | `NEXT_DIST_DIR=.next-audit npm run build` | Compiled successfully (16.2 s); `tsconfig.json` edit reverted afterwards |
| Offline unit tests | all `docs/page-reports/tools/*unit-test.mjs` with `--import ./docs/page-reports/tools/alias-register.mjs` | 28 scripts. 26 pass completely. `25-26-rules` fails 1 check (S-09) and `27-list-rules` fails 1 check (S-07): both are outdated assertions (M-08) |

**Not run, and why:**

| Area | Status | Reason |
|---|---|---|
| Database and runtime verification (collections, indexes, `explain`, data contents) | **NOT VERIFIED** | No local, test or staging database was explicitly approved for this audit; production credentials are in `.env.local` and were deliberately not used. Database contents were not read. |
| Integration, concurrency and security test suites (`41-` to `45-*-test.mjs`) | NOT RUN | They need a running `next start` server and a throwaway database |
| Browser/E2E, responsive widths (320–3440), landscape, zoom 80–200 %, accessibility tooling, Lighthouse | **NOT RUN** | Needs a server and Chrome automation against an approved database; no coverage is claimed |
| Performance (latency, p50/p95/p99) | NOT MEASURED | Same reason; findings in D are static (unbounded reads, missing indexes) |
| Cross-supplier IDOR and CSRF reproduction | NOT EXERCISED | Static trace only: guard and scoping found on every supplier API (`requireSupplierApi` present in all 51 routes); no live attack was run |

**Static security trace summary:** every `/api/supplier/*` route calls `requireSupplierApi` (or the shared support guard); queries are scoped by `supplierKey ∈ company.sellerKeys` or by `companyId`; money is server-computed; writes use allow-listed fields and idempotency keys where required. Gaps are S-01, S-02, D-04 and M-03/M-04 above. No secrets were printed.

---

## H. Go-live blockers

**Mandatory (the portal cannot honestly go live without these):**
1. D-01: a real seller-to-company mapping workflow.
2. S-01 and S-02: remove the fake verification endpoints.
3. D-04: remove the legacy product create route.
4. A runtime test pass (integration, security and responsive scripts) against a throwaway database, which has never been done for this portal.
5. A deployed environment with `MONGODB_*`, `AUTH_SECRET` and (for quoting) `QUOTATION_TAX_RULES` configured; no deployment has been verified.

**Required for the full business flow, but a launch can choose to ship without them if the product scope is narrowed and the UI says so:** order creation (D-03), product publishing and moderation (D-02), supplier verification, notification producers, payments, support-staff tooling.

**Optional improvements:** the Inquiries list page (needed once D-01 lands), merging the two security UIs, tracker corrections, database-side product filtering, stale test updates.

---

## Proposed tracker corrections (not applied)

| Row | Current | Proposed correction |
|---|---|---|
| 35 Supplier Dashboard | Development: Implemented | Keep; note stale capability messages (M-01) and structural zeros (D-01) |
| 36 Company Profile | Design/Prompt Complete | Add "self-verify endpoints S-01/S-02 must be removed"; QA stays In Progress |
| 39 Product Management | Complete/Complete/Implemented | Remove the "Add Product dialog" wording (the modal was deleted); mark legacy create route as a defect (D-04) |
| 41 Edit Product | Not Started | In Progress: `/supplier/products/[productReference]/edit` exists (own drafts only); route text differs from the tracker's `[id]` |
| 42 Inventory | "Complete", `supplier_inventory` text | Replace text with the ledger model (`inventory_positions` / `inventory_movements`); no reservations |
| 44 Buyer Inquiries (`/supplier/inquiries`) | Not Started | Merge with row 108 (duplicate route); list page remains Not Started |
| 45 / 110 / 111 Quotations | Implemented | Add "submission requires `QUOTATION_TAX_RULES`" |
| 47 Analytics | In Progress | Keep; note zeros come from D-01 |
| 48 Supplier Settings | Complete/Complete | Change Design/Prompt to Reference Received: controls are intentionally disabled until producers exist |
| 77 Forbidden | Not Started | Unchanged; `src/app/forbidden/` exists but is not browser-verified |
| Supplier Account Security | no row | Add a row for `/supplier/security` (built on the shared module) without inventing a page number |
| New: Seller–company mapping | no row | Add (blocker D-01) |

---

*Evidence references are file paths and line numbers in the working tree at the time of audit. Re-run the unit-test and build commands in section G to reproduce the automated results.*
