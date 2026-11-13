# Core B2B sourcing journey: readiness report

Date: 2026-11-13 · Branch `main`, working tree on top of `1919536` (many uncommitted changes) · Nothing deployed, no production data touched, no external message sent.

**Headline.** All four journeys are now connected in code and every statically checkable rule passes, but **no journey has been verified at runtime**: no isolated, transaction-capable database exists in this environment (no `mongod`, Docker, WSL or Atlas test cluster), so every integration suite is **BLOCKED**. A green build and green unit/source checks do not prove the workflow. Do not treat the marketplace as launch-ready beyond the narrow scope at the end.

## Integration matrix
| Workflow | Actual UI | API / service | Data source | Dependencies | Verification |
|---|---|---|---|---|---|
| Supplier draft -> review submission | `/supplier/products/new`, `/[id]/edit` | `/api/supplier/products/drafts`, `productDraftService` | `supplier_products.draft` | ImageKit keys for images | static suites `58`,`60`; runtime BLOCKED |
| Admin approval | `/admin/product-review` | `admin/productReview.decide` (transaction, exact revision, audit row) -> `invalidateApproved()` | `publication.snapshot` | admin `products.review` capability | static `60`,`63`; runtime BLOCKED |
| Approved product public | `/products`, `/search`, `/categories/*`, `/products/[slug]`, `/suppliers/c-<id>` | one listing engine + `approvedProducts.ts` snapshot (publication snapshot only, bounded, TTL 60 s) | CSV + MongoDB in ONE row set | none | `63` (34 checks on the real 21,392-product engine); built server smoke-checked over HTTP (no DB) |
| Get Best Price / Send Requirement | `/inquiry/[supplier]` (notice, "Send Requirement") | `POST /api/public/inquiries` -> `submitInquiry` (+ job in one transaction) | `inquiries`, `distribution_jobs` | none | static; runtime BLOCKED |
| DIRECT + MATCHED leads | `/supplier/inquiries` (All / Direct / Matching leads) | `distribution.runDistribution`, `POST /api/internal/distribution`, `findInquiryFor` | `inquiry_recipients`, `inquiries.matchedSupplierKeys` | `DISTRIBUTION_WORKER_SECRET` + a scheduler | `62` (31), `65` (19); `it-lead-distribution.mjs` BLOCKED |
| Supplier reply | inquiry detail `ResponsePanel` | `inquiryService.sendResponse` (idempotent, one transaction, outbox) | `inquiry_messages` | none | existing suites; runtime BLOCKED |
| Buyer private reply | `/buyer/inquiries/[ref]` Supplier Responses | `/api/buyer/inquiries/[id]/conversations[/..]`, `conversations.ts` | `inquiry_messages` (`sender: BUYER`) | `AUTH_SECRET` | `64` (24); `it-conversation-flow.mjs` BLOCKED |
| Quotation create/submit | `/supplier/quotations/create` | `quoteService` (uses the recipient's view), exact money, tax config | `quotations` | `QUOTATION_TAX_RULES` (business-approved) or submission is blocked | existing suites; runtime BLOCKED |
| Offer comparison | `/buyer/quotations/compare` | `compareBuyerQuotations` (+ product mismatch, source label) | `quotations` | none | `64`; runtime BLOCKED |
| Decisions | quotation detail | `decideQuotation` (exact version, stale = conflict) | `quotations` | none | existing suites; runtime BLOCKED |
| Admin: seller mapping, inquiry review, support | `/admin/company-links`, `/admin/inquiries`, `/admin/support` | admin services (capabilities) | `supplier_companies`, `admin_audit_log` | admin accounts set in the database | static `58`,`61`; runtime BLOCKED |

## Journey results
| Journey | Result | Evidence and gaps |
|---|---|---|
| **A** product -> public discovery | Code complete for listing, search, category, detail, profile and inquiry; **runtime BLOCKED** | The engine and DTOs are tested on real data with a filled snapshot. NOT built: homepage sections, saved/compare views of supplier products, related products, an unpublish/archive action (`archivedAt` is respected but nothing sets it). Cross-source identity: catalogue ids numeric, samples by slug, supplier products `sp-<id>`: no collisions by construction and by test. |
| **B** direct + matched leads | Code complete; **runtime BLOCKED** | DIRECT is the inquiry's own `supplierKey` (provenance), **not a separate recipient row** (the brief's "one DIRECT recipient" is satisfied by the canonical inquiry, not by a row). MATCHED: exact policy `match-1` (same category + name + colour), one per company, frozen cutoff, recheck per recipient, batches resume at a cursor. **Gap:** approved supplier products are not matched (catalogue products only); matching them needs a product-equivalence design. |
| **C** private conversations | Code complete; **runtime BLOCKED** | Both directions are scoped by (inquiry, buyer, supplier key); the MATCHED view is redacted in the service. NOT built: attachments for inquiries and messages (no private file model exists), so direct-only attachment protection has nothing to protect yet; read receipts/typing are deliberately absent; internal notes exist only in support tickets, never in these conversations. |
| **D** quotation + comparison | Existing engine reused; **runtime BLOCKED** | Comparison names currency, unit, quantity, product and expiry differences and ranks nothing. **Policy conflict (not changed):** the unique index `one_accepted_per_inquiry` and `allowedActions(..., otherAccepted)` allow only ONE accepted quotation per inquiry, which prevents split sourcing. Removing it is a migration and a business decision. The buyer's decision notice to the supplier is sent after the commit from the route (`quotations/http.ts`, deduplicated by key) and is **not crash-durable** (unlike replies and leads). |

## Permission matrix
Verified by **static source checks** (suites `58`, `60`, `61`, `62`, `64`, `65`) and the earlier HTTP probes without a database: every supplier write route has an origin check; unauthenticated admin/supplier APIs answer 401 and pages 307; cross-site writes 403; the buyer reply route needs a buyer session, origin check, rate limit and reads only `message` and `idempotencyKey`; every conversation and requirement read is by reference AND the session buyer; suppliers read inquiries only through `findInquiryFor`; the worker route is off without its secret and compares in constant time.
**Not verified at runtime:** the positive/negative matrix with isolated identities (Buyer A/B, Supplier A, matching B, unrelated C, authorised and restricted admin, anonymous) is prepared inside `it-lead-distribution.mjs`, `it-approved-flow.mjs` and `it-conversation-flow.mjs` (Buyer B and unrelated companies get 404/null, forged tokens 404, idempotency replay, stale decision) but BLOCKED. Admin restricted-capability behaviour, CSRF on the new buyer route against a live session and private-cache isolation were not exercised.

## Notifications and live refresh
| Event | Producer | Durability | Preference effect |
|---|---|---|---|
| Direct inquiry received | `submitInquiry` -> `notifySellerOwner` | post-commit, deduped by reference; **not** retried if the process dies between insert and notice | suppresses the notice only |
| Matched lead | recipient row `notice: PENDING` + worker sweep | durable | `SKIPPED_PREFERENCE`; the lead stays in the inbox |
| Buyer private reply | message row `notice: PENDING` + worker sweep | durable | same |
| Supplier reply / quotation submitted / revised / withdrawn | `notification_outbox` in the business transaction | durable; retried when the supplier opens a list (and by the sweep where wired) | buyer category switch |
| Quotation decision / order confirmed | route, post-commit, deduped | best effort | supplier category switch |
| Product review decision | after the decision transaction | best effort | supplier category switch |
No e-mail/SMS/WhatsApp exists. **There is no push or live refresh** (no socket/polling): badges and counts update on navigation or reload from real state; the inbox and conversation panels refetch after their own mutations. An API failure shows an error with Retry, never zero.

## Worker execution
Built: durable jobs (`distribution_jobs`), atomic lease with expiry recovery, bounded backoff, `FAILED` visibility, cursor resume, closure stop, protected endpoint `POST /api/internal/distribution`, notice sweeps (leads and buyer replies). **Not deployed and not run against a database**: no scheduler exists in this repository. Required: set `DISTRIBUTION_WORKER_SECRET` (24+ characters) and have a scheduler call the endpoint about every minute (Vercel Cron or an external cron with the bearer header). Without it only the best-effort pass after a submission runs and jobs stay `PARTIAL`/`PENDING`, shown honestly as "Processing". Multi-batch execution is covered by `it-lead-distribution.mjs` (batch size 2) but was not run.

## Responsive and accessibility
**Real browser (existing audit tool, 44 widths incl. zoom emulation and landscape, unauthenticated, built server with an unreachable database):** `/products`, `/search?q=shirt`, `/products/industrial-air-compressor`, `/suppliers/shree-textiles`, `/inquiry/shree-textiles`, `/categories/industrial-machinery`: no horizontal overflow, clipped text, distorted images, small targets or tiny text. Earlier round: `/`, `/sign-in`, `/sign-up`, `/register-supplier` clean.
**Not run (need sessions and data):** supplier inbox, lead detail, conversation panels, quotation builder, buyer requirement detail with conversations, offer comparison, admin pages; 3440 only where the tool's width list includes it; no screen reader, keyboard-walk or contrast tooling beyond the tool's own checks. Mocked UI checks: none were run; there is no authenticated E2E evidence.

## Performance
**No measurements were taken; no latency, query-plan or response-size numbers are claimed.** Designed bounds: pages default 20 / max 50, indexed list queries (`inquiry_matched_*`, `inquiry_messages_conversation`, `recipient_*`, `job_runnable`, `published_by_category`), batched counts (two grouped reads per list page), one in-memory engine for the catalogue. Known cost: the matching-leads list aggregates up to 5,000 recipient rows of the company; a first request after a database outage waits for one connection attempt (then 15 s backoff). `explain("executionStats")` must be run on a seeded isolated database.

## Commands run and results
| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | clean |
| all `docs/page-reports/tools/*unit-test.mjs` (`node --import ./docs/page-reports/tools/alias-register.mjs <file>`) | 36 scripts, 36 passing, including new `62` (31), `63` (34), `64` (24), `65` (19) |
| `NEXT_DIST_DIR=.next-audit npm run build` | compiled; `tsconfig.json` restored |
| built server on :3100, unreachable `MONGODB_URI` | public pages, products API, unknown product/company (404) as expected; server then stopped by verified PID |
| `docs/responsive/tools/audit.mjs` on 6 public journey routes | clean (above) |
| `it-lead-distribution.mjs`, `it-approved-flow.mjs`, `it-conversation-flow.mjs`, `it-supplier-flows.mjs` | **BLOCKED**: the guard refuses without `FINBYN_TEST_MODE`, `TEST_MONGODB_URI`, `TEST_MONGODB_DB=finbyn_it_*`, `TEST_DB_CONFIRM` (verified for each) |

## Files changed in this journey (new unless marked)
Catalogue: `src/lib/catalog/approvedStore.ts`, `approvedProducts.ts`; modified `categories.ts`, `categoryListing.ts`, `productDetail.ts`, `supplierDetail.ts`, `productRef.ts`, `publicProduct.ts`, `src/types/index.ts`, product/supplier/search/category pages and public APIs (`ensureApproved`), `ProductCard`, `ProductPurchase`, `inquiry/[supplierSlug]/page.tsx`, `instrumentation-node.ts`.
Leads: `src/lib/leads/*` (`matchingRules`, `catalogCandidates`, `distribution`, `access`), `api/internal/distribution/route.ts`, `inquiries/service.ts`, inbox service/UI, dashboard service/UI, inquiry form notice, success page.
Conversations: `src/lib/inquiries/conversations.ts`, `messages.ts`, `api/buyer/inquiries/[id]/conversations/*`, `SupplierConversations.tsx`, `InquiryTabs.tsx`, `InquiryDetailView.tsx`, `buyerDetail.ts`, `buyerList.ts`, `BuyerInquiryTable.tsx`, comparison (`quotations/quotationRules.ts`, `service.ts`, `CompareView.tsx`).
Company identity: `supplier/company.ts` (implicit `co:<id>` key), `notifyOwner.ts`, `orderConfirmation.ts`.
Tests: `62`–`65` unit suites, `it-lead-distribution.mjs`, `it-approved-flow.mjs`, `it-conversation-flow.mjs`; `60` and `61` source assertions updated for intentionally changed code. Docs: `docs/leads/*`, `docs/catalogue/APPROVED_PRODUCTS_INTEGRATION.md`, this report; `CLAUDE.md`, tracker.

## Exact configuration required
`MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`; `IMAGEKIT_*` for product images; `QUOTATION_TAX_RULES` (business-approved, else quotations cannot be submitted); `DISTRIBUTION_WORKER_SECRET` and a scheduler; optional `FINBYN_APPROVED_CACHE_MS`; admin accounts with capabilities `products.review`, `sellers.map`, `inquiries.*`, `support.manage` created in the database; company-seller links made by an admin (a company with none still has its own products, inbox and matching leads through its implicit key). Isolated test database: `docs/testing/TEST_ENVIRONMENT.md`.

## Remaining blockers and decisions
1. Provide an isolated transaction-capable database and run the four integration suites; fix what fails. Until then nothing above is "verified".
2. Decide the one-accepted-quotation-per-inquiry policy (split sourcing) before promising multi-supplier sourcing.
3. Matching for approved supplier products, attachments for inquiries/messages, unpublish action, homepage/saved/related integration of supplier products, durable notices for direct inquiries, decisions and product reviews: not built.
4. Deploy a worker scheduler; confirm the 2,000-company and 2,000-product caps and the 60 s snapshot TTL.
5. Authenticated responsive/accessibility and performance (`explain`) runs.

## Narrow launch scope the evidence supports today
Public browsing, search, detail and supplier pages of the catalogue (CSV and sample data, flagged as test data) with the inquiry form for registered buyers. Everything involving supplier accounts, matching, conversations, offers and decisions needs the integration suites to pass in staging first.

---

## Verification round 2 (2026-11-13, later): test environment and the four suites

**Result: the four integration suites are still BLOCKED. They did not run.** Implemented is not runtime verified, and runtime verified is not ready for launch.

**Test environment inspected (nothing installed, nothing started, no database connection made):** no mongod or mongosh, no Docker or Podman, WSL not installed (the wsl.exe stub only reports that), no MongoDB service or install folder, no mongodb-memory-server, no MONGOD_BIN, no TEST_MONGODB_* variables, nothing listening on 27017 or 27018. winget exists, so the missing dependency is installable: **MongoDB Community Server**. I did not install it: a system-level install was not authorised by this task and needs administrator rights. The live database was never touched and the guard is unchanged.

**Prepared and actually run without a database**
| Command | Result |
|---|---|
| `node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-preflight.mjs` (new) | 27 checks pass: all four suites parse and every module they import loads; it reports the four prerequisites as missing and says BLOCKED |
| `node docs/page-reports/tools/run-integration-suites.mjs` (new) | prints BLOCKED with the missing variable names and exits 2 without running anything |
| `node docs/page-reports/tools/start-test-replset.mjs` | refuses clearly (`spawn mongod ENOENT` plus the install hint); the empty `.test-mongo` it created was removed |
| each suite with only `FINBYN_TEST_MODE=1` | the guard refuses (REFUSING TO RUN), as designed |

**Defect found by the preflight and fixed (real; it affected two suites).** Three supplier services (`inquiryService.ts`, `quoteService.ts`, `quotationVersions.ts`) declared a TypeScript parameter property (`constructor(public readonly failure: Failure)`), which Node's TypeScript loader cannot run. `it-lead-distribution.mjs` and `it-conversation-flow.mjs` (both import `sendResponse`) and any suite touching quotations would have crashed at import time. Rewritten as an explicit field with identical behaviour. Files changed: `src/lib/supplier/inquiryService.ts`, `src/lib/supplier/quoteService.ts`, `src/lib/supplier/quotationVersions.ts`. No assertion was weakened. Regression run after the fix: `tsc` 0 errors, lint clean, 36 of 36 unit scripts pass, production build compiled (`tsconfig.json` restored).

**Suite status**
| Suite | Status | Why |
|---|---|---|
| it-supplier-flows (mapping, ownership, one order per quotation, reservations) | BLOCKED | no database |
| it-lead-distribution (DIRECT/MATCHED, batches, retry, dedup, closure) | BLOCKED | no database |
| it-approved-flow (public eligibility, pending edit, archive, inquiry reaches the owner) | BLOCKED | no database |
| it-conversation-flow (inbox, private conversations, notices, comparison, stale decision) | BLOCKED | no database |

Not verified for the same reason: transaction rollback, concurrency, worker crash and retry, the one-accepted-quotation-per-inquiry rule (unchanged, per instruction), notification durability and preferences against real data.

**Exact steps to unblock this machine** are in `docs/testing/TEST_ENVIRONMENT.md` ("Exact steps for THIS machine"): `winget install --id MongoDB.Server -e` (administrator), set `MONGOD_BIN`, run `start-test-replset.mjs` (loopback, port 27018, git-ignored `.test-mongo`, pid file for safe cleanup), then the preflight and `run-integration-suites.mjs` with `FINBYN_TEST_MODE`, `TEST_MONGODB_URI`, `TEST_MONGODB_DB`, `TEST_DB_CONFIRM`.

**Remaining gaps (unchanged by this round):** approved supplier products are not matched; no unpublish action; no inquiry or message attachments; durable notices only for leads and buyer replies; no scheduler for `POST /api/internal/distribution`; no authenticated responsive, accessibility or performance evidence.
