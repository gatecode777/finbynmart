# Page 45 — Supplier Orders: audit (2026-11-12)

Owner PRD "Supplier Orders — proposed Page 45", route `/supplier/orders`, portal SUPPLIER. Done before any code. Evidence: the repository (files named below) and the throwaway-database tests.

## 1. Tracker verification (page number)
`docs/PAGE_TRACKER.md` already assigns **ID 45 to "Quotation Management" (`/supplier/quotations`)**. There is no baseline row for Supplier Orders and no `/supplier/orders` route anywhere in the tracker. The existing assignment is preserved and nothing is overwritten: Supplier Orders takes the next free discovered-addition ID (**112**; 109–111 are the supplier Pages 41, 43 and 44 recorded in the same change). "Page 45" below always means the owner's PRD number. The PRD's assumption that Page 45 is free is the mismatch to report.

## 2. What exists (and what the PRD assumed)
| PRD assumption | Repository reality | Consequence |
|---|---|---|
| A central order system to reuse | **Yes**: the `orders` collection, `src/lib/orders/orderRules.ts` (the one 13-status lifecycle, cancellation rules, list query, CSV helpers) and `src/lib/orders/service.ts` (document type, 6 buyer indexes, buyer list / summary / detail / cancellation request / export). Built for the buyer (Pages 31–32). | Reused as is; no second order store, no per-portal copy. Supplier code lives in `src/lib/supplier/orderRules.ts` and `orderService.ts` and reads the same collection. |
| An order is created by quotation acceptance or a confirmation step | **Nothing creates an order.** No checkout, no order-confirmation workflow, no conversion of an accepted quotation (`docs/backend/PAGE_42_ORDER_CONVERSION_RULES.md`: BLOCKED, with the rules a future conversion must follow). The only writers are tests and the buyer's cancellation *request*. | A real account sees the honest empty state. Accepted quotation ≠ order is kept: the page never infers an order from an acceptance. |
| Multi-supplier orders and supplier allocations | **No.** An order document has exactly one `buyerId` and one `supplierKey` (`OrderDoc`). There is no multi-supplier order and no sub-order. | Isolation is structural: an order of another supplier is never inside one of ours. Counts are *orders*, not sub-orders. The privacy section (`PAGE_45_SUPPLIER_ORDER_PRIVACY_RULES.md`) still keeps the role-specific DTO. |
| Separate lifecycle, fulfilment and payment states | **One** stored `status` (13 values). "Fulfilment" does not exist as a stored field; the existing `deliveryLabel(status)` is its delivery *meaning*. **No payment data** of any kind (no ledger, provider, invoice). | Lifecycle = stored status; fulfilment = a derived label; payment = always "Payment status unavailable". No new persisted status was added to match the mock-up (the mock-up's In Progress / Ready to Dispatch / Dispatched / Cancelled are groups of stored statuses). |
| Supplier confirm / cancel / update fulfilment | **No supplier lifecycle workflow.** The buyer page records a cancellation *request* "until the supplier side (not built) decides". | The list and detail are read-only. Row actions (Confirm, Cancel, Update fulfilment, Mark paid) are **not offered**; the capabilities object says why. |
| Staff permissions | One login per company (the owner). `SupplierPermissions` already had `viewOrders`; this page adds `exportOrders`. No staff roles, no financial-field permission. | Permission checks exist in the routes, the page and the service layer (unit-level for roles that do not exist yet); there is no separate "financial fields" permission, amounts belong to `viewOrders` (stated, not hidden). |
| Order detail route | None for suppliers. | A compact **read-only** detail `/supplier/orders/[reference]` was built so *View Order* never dead-ends (separately documented scope, like the buyer's compact detail). |
| Export infrastructure | Page 42's pattern: a CSV built and sent in the one response, capped at 5,000 rows, formula-safe, logged by counts. No asynchronous job system exists. | Reused. No background export, no download link, nothing stored; a cut-off is announced in headers and in the UI. |
| Audit / notification infrastructure | `security_events` (export log), `notification_outbox` + buyer notices (written by supplier *mutations*). | The export is logged. This page performs no mutation, so it writes no notice. |
| Search infrastructure | None for orders beyond bounded regex inside a tenant (Page 42 pattern). `users` has no index to search a business name. | Supported: order, quotation and inquiry reference prefixes and product-name substring (inside the company's own orders). **Buyer names are not searchable** (an order stores only the buyer's id): documented limitation, stated on the page. |

## 3. Blockers recorded (nothing fabricated)
1. No order creation / confirmation workflow → the list is empty for real accounts until one exists.
2. No supplier order lifecycle actions (confirm, cancel decision, dispatch, delivery) and no stock reservation.
3. No payment ledger / provider → payment status unavailable on every order.
4. No shipment module → no tracking events.
5. No asynchronous export jobs → bounded synchronous export only.
6. No indexed buyer-name search.
7. No staff roles or financial-field permission (one owner login per company).

## 4. Configuration
None new. The supplier company must own at least one `sellerKeys` entry (platform-set) to see orders; a company with none sees "No seller is linked to your company yet".
