# Supplier portal fix plan (from FINBYN_SUPPLIER_PORTAL_AUDIT)

Date: 2026-11-13. Identifiers are the audit's finding IDs and actual routes (the tracker numbering differs).

## Environment limits that shaped the plan
- No isolated database exists (no local `mongod`, no Docker, no in-memory driver). The only configured database is the live one, which must not be used for mutation tests. So **integration, concurrency, browser, responsive and `explain` verification are BLOCKED**; every fix below is verified statically (TypeScript, lint, build, unit and source-regression scripts) only.
- Nothing was deployed, no real company was linked and no production data was touched.

## Finding-to-file implementation map

| Finding | Action | Files |
|---|---|---|
| S-01, S-02, M-07 | Delete the fake verification routes, the second security service and its panel; Company Security tab redirects to the shared page; add verification provenance fields | `src/app/api/supplier/security/*` (removed), `src/lib/supplier/securityService.ts` (removed), `SupplierSecurityPanel.tsx` (removed), `src/app/supplier/company/page.tsx`, `src/lib/auth/users.ts`, `src/lib/auth/passwordReset.ts`, `docs/audits/tools/verification-provenance-dryrun.mjs` |
| D-04 | `POST /api/supplier/products` returns 405; `createSupplierProduct` removed; invented catalogue stock of 50 removed | `src/app/api/supplier/products/route.ts`, `src/lib/supplier/productService.ts`, `SupplierProductsWorkspace.tsx` |
| M-03, M-04 | Origin check on the remaining supplier write routes; rate limits on notification reads | `src/app/api/supplier/{company,company/documents,company/documents/[id],profile,support/tickets,notifications/*}` |
| D-01 | Admin seller-to-company link: capability `sellers.map`, unique partial ownership index, transaction plus audit row, admin page and APIs | `src/lib/admin/{mappingRules,sellerMapping,permissions}.ts`, `src/lib/supplier/company.ts`, `src/app/api/admin/company-links/*`, `src/app/admin/company-links/page.tsx`, `src/components/admin/{CompanyLinksWorkspace,AdminShell}.tsx` |
| M-02 | Complete supplier inbox | `src/lib/supplier/{inquiryListService,inquiryInboxRules}.ts`, `src/app/api/supplier/inquiries/list/route.ts`, `src/app/supplier/inquiries/page.tsx`, `SupplierInboxWorkspace.tsx`, `supplierNav.ts` |
| M-01 | Accurate capability flags and wording | `dashboardService.ts`, `SupplierDashboard.tsx` |
| M-06 | Exact-id product lookup for inventory adjustments | `productService.ts` (`findOwnedProduct`), `inventoryService.ts` |
| M-09 | Document `QUOTATION_TAX_RULES` | `.env.example`, `docs/config/SUPPLIER_CONFIGURATION.md` |
| M-08 | Correct two stale assertions | `25-26-rules-unit-test.mjs`, `27-list-rules-unit-test.mjs` |
| M-10 | Reconcile tracker by route | `docs/PAGE_TRACKER.md` |

## Not started, with the decision each needs
- **D-02 moderation and publishing:** needs the approved review policy (who reviews, what a reject reason may say, the public eligibility rule, category activation) and a public-listing integration across product, search, category, supplier and homepage surfaces.
- **D-03 order confirmation (and stock reservation / dispatch):** needs the approved trigger and authority (who confirms an accepted quotation), plus reservation, partial-fulfilment, cancellation and backorder rules.
- **M-05 notification producers and support-staff tooling (L-01):** need the events above and a staff permission design; the in-app channel and the preference enforcement already exist.
- **Unlink / reassignment of a seller:** policy on access consequences is unresolved.
- **Phone verification:** needs an approved OTP provider.

## Second pass (2026-11-13): what moved
Built after the first pass: explicit order confirmation with stock reservation (D-03, reservation part of the inventory rules), product moderation (D-02, supplier submit/withdraw and admin review), notice producers for inquiries, quotation decisions, confirmed orders, product decisions and support replies (M-05), the staff support workflow (L-01), the windowed product list (M-06, partial), the fail-closed test database guard and a prepared integration suite. Full status: `FINBYN_SUPPLIER_FIX_REPORT.md`.

Still open, each with its dependency: public-surface integration of approved products (listing-engine design for two sources), dispatch and release-on-cancellation (UI and policy), buyer-side notices, inventory list refactor (M-06 rest), startup validation of the tax configuration, phone verification (provider), seller unlink/reassign (policy), and every database-dependent verification (isolated database).
