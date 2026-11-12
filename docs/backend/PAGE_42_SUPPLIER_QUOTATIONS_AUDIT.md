# Page 42 — Supplier Quotations: pre-implementation audit (2026-11-11)

Verified against the repository before building. Result: **the read side and the withdrawal can be built honestly on the existing `quotations` collection; creating, editing, revising, PDF, order conversion and supplier notifications have no foundation and are BLOCKED, not simulated.**

## What the owner's PRD assumed, and what exists
| PRD assumption | Repository fact |
|---|---|
| Pages 39–41 (supplier dashboard, inquiries, inquiry details) are built | Page 39's shell, `supplier_companies` model and dashboard API exist (uncommitted). **At audit time the dashboard page imported `SupplierDashboard`, which did not exist, so `tsc` and `next build` failed; it has since been written (2026-11-12).** Page 40 was audited and BLOCKED (`PAGE_40_SUPPLIER_INQUIRIES_AUDIT.md`); Page 41 does not exist. `/supplier/inquiries` is not a route |
| A supplier quotation creation/submit API exists | **No.** Nothing creates a quotation: the buyer side reads them, tests insert them. Page 43 (creation) does not exist |
| Quotation versioning exists or must be added | It exists in the schema: one document per version, same `reference`, one `isCurrent`, older ones `SUPERSEDED`. Nothing yet writes a new version (that is the creator) |
| A PDF generator and private document storage for quotations | **No.** Only buyer company documents (`documentStorage.ts`) and a browser Print button on the buyer page exist |
| An order is created from an accepted quotation | **No.** `orders` has an optional `quotationReference`; nothing creates an order from a quotation. The buyer page says order processing is not available |
| Supplier notifications and email | **No.** Notifications are buyer in-app only (`notifications`); no email service |
| Supplier roles / membership | One login per company (the owner). `SupplierContext` carries role and permissions for a future membership table |
| Export service / background jobs | No queue. A bounded synchronous CSV (buyer orders precedent) is the pattern |

## Existing quotation architecture (reused, not duplicated)
- Collection `quotations` (`src/lib/quotations/service.ts`, `QuotationDoc`): `reference` (`FBM-QT-XXXXXXXX`), `version`, `isCurrent`, `inquiryId` / `inquiryReference`, `buyerId`, `supplierKey` (the seller key the inquiry was addressed to), `productName`, `productSnapshot`, `currency`, `unit`, `quantity`, `unitPriceMinor`, `discount`, `tax`, `charges`, `moq`, `terms`, `validUntil`, `status` (`DRAFT | SENT | REVISION_REQUESTED | SUPERSEDED | ACCEPTED | REJECTED | WITHDRAWN`), `accepted` (partial unique index: one per inquiry), `decision`, `events[]`, `sentAt`, `createdAt`, `updatedAt`.
- Lifecycle and expiry: `src/lib/quotations/quotationRules.ts` (`effectiveStatus`: expiry is derived from `validUntil` at read time, never stored).
- Money: `src/lib/quotations/money.ts` — integer minor units, BigInt arithmetic, basis points, half-up rounding; tax only when the quotation states one.
- Buyer decisions: `decideQuotation`, `requestRevision` (Pages 29–30). A supplier never writes those.
- Tenancy: `supplier_companies.sellerKeys` (platform-set, starts empty; no self-claim). Every supplier read is `supplierKey ∈ sellerKeys`.
- Notifications: `notifyBuyer()` with `dedupeKey`; export precedent `POST /api/buyer/orders/export`.

## Decisions taken (my calls, flagged)
1. **One quotation system**: the supplier service reads/writes the same collection; the buyer service's pricing helpers (`totals`, `breakdownRows`, `termsRows`, `changesBetween`) were exported, not copied.
2. **Logical quotation = the current version of a lineage** (`isCurrent: true`). All counts and lists use it, so a revision never counts twice. Withdrawn ones count in the total and appear under All; they have no tab.
3. **KPI cards are lifetime**, independent of every filter; tab counts follow the active search and filters (except the status). Stated on the page.
4. **Submitted** = stored `SENT` or `REVISION_REQUESTED` with validity not ended. **Expired** = those same stored statuses past `validUntil` (server clock). Accepted / Rejected only from the buyer's recorded decision.
5. **Withdrawal** is the only supplier status change, allowed for the current version while it waits on the buyer and is valid (see `PAGE_42_QUOTATION_WITHDRAWAL_RULES.md`).
6. **No amount sorting**: the total is derived at read time, not stored; sorting on unit price × quantity would ignore discount, tax and charges, and mixed currencies must never be ranked. Needs a stored `totalMinor` written by the future creator.
7. **No buyer search / buyer filter / category filter**: the quotation holds no buyer name or category; resolving them means unindexed lookups across other collections. Buyer is shown (business name only) but not searchable; category is on the related inquiry only.
8. **PDF**: BLOCKED; the detail page offers the browser's Print (stated as such).

## Missing functionality (BLOCKED, each with the reason shown in the UI)
Create Quotation, edit draft, create revision, submit (Page 43); PDF generation and private download; order conversion; supplier notifications (buyer decision, expiry); email; background export for very large files; amount sorting; buyer / category filters; viewed / under-review states (no tracking exists, so those statuses are not shown).

## Security risks found and handled
Cross-supplier IDOR on detail / versions / withdraw / export (isolation in the service queries, identical 404); status or price tampering (no PATCH route, withdrawal body whitelist); CSV formula injection (`csvCell`); cross-site writes (`isCrossSiteWrite`); NoSQL operator injection (typed query parser, escaped search); rate limits (240/min reads, 20/10 min withdrawals, 10/10 min exports). Open: no role enforcement beyond the owner (single login per company); `buyerNames` reads `companyName` only.

## Performance gaps found and closed
First 10,000-row measurement: summary p95 420 ms and search+tab 452 ms (over target) because the list ran three overlapping aggregations that fetched documents. Fixed by one covered aggregation (`supplier_current_summary`) feeding cards, tabs and the currency list, and `supplier_current_status_created` for status tabs. See `PAGE_42_PERFORMANCE_REPORT.md`.
