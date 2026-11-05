# Page 27 — Buyer My Inquiries: audit before implementation

Checked against the repository on 2026-11-04. The Page 13/14 PRDs and the platform audit do not prove anything about the inquiry module, so this lists what the code does.

| Area | Finding |
|---|---|
| Collection | `inquiries` (one collection, written by Page 13's `submitInquiry`). Fields: `buyerId` (registered), `buyerType`, `reference` (unique sparse `FBM-INQ-XXXXXXXX`), `supplierKey/Name/Slug/source`, `productKey/Name`, `quantity`, `unit`, `message`, `inquiryType` (old records: `type` quote/inquiry), `deliveryLocation.text`, `consent`, `status`, `statusHistory[]` (`from`, `to`, `actor`, `at`, `reason`), `notification` (always BLOCKED), `createdAt`, `updatedAt`, `cancelledAt`, guest data for guests. No `categoryName`, no target price, no required-by date, no attachments, no title. |
| Buyer link | Registered buyer by `buyerId` from the session. Guests have no `buyerId`: a guest inquiry is never matched to an account by e-mail. |
| Supplier link | `supplierKey` (+ name, slug). One supplier per inquiry: no multi-supplier distribution. No `supplierId` ObjectId; the filter parameter `supplierId` carries the `supplierKey`. |
| Statuses | NEW, NOTIFIED, IN_PROGRESS, REPLIED, QUOTED, CLOSED, CANCELLED, REJECTED (`rules.ts`, with allowed transitions). **Only NEW and CANCELLED are ever written**: no supplier, admin or notification process exists, so nothing else can occur. Older records carry lowercase `new`. |
| Cancellation | `BUYER_CANCELLABLE` = NEW, NOTIFIED, IN_PROGRESS; `cancelBuyerInquiry` (by id) appends to `statusHistory`; `PATCH /api/buyer/inquiries/[id]/cancel`, 30 per 10 minutes. |
| Existing API | `GET /api/buyer/inquiries` (up to 100 rows, optional `?status=`, returns private `message` and location), `GET /api/buyer/inquiries/[id]` (id or reference), `PATCH .../cancel`. All used `getCurrentUser` without a role check. |
| Existing page | `/account/inquiries` (cards with cancel), outside the buyer shell, no filters, no pagination, no counts. |
| Indexes | `{buyerId,createdAt}`, `{supplierKey,createdAt}`, `reference` unique sparse, `idempotencyKey` unique sparse, `{guest.email,createdAt}`; the dashboard also creates `{buyerId,status}`. None serves `buyerId + status + sort` or `updatedAt` sorts with an `_id` tie-breaker. |
| Responses, quotations, messages, events | No supplier response model, no quotation collection or route, no messaging, no inquiry event collection beyond `statusHistory`, no notification to suppliers. |
| Dashboard | Counts "active" as NEW/new/NOTIFIED/IN_PROGRESS; its Total is date-range based. |

## Decisions
1. **Reuse the one collection.** No second inquiry collection, no copies of status.
2. **Replace the old list in place:** `/api/buyer/inquiries` keeps its route and the `inquiries` array and gains filters, paging and counts; the private `message` and `deliveryLocation` leave the list (still in the owner-only detail). `/account/inquiries` redirects.
3. **Category:** inquiries store none, so `categoryKey` and `categoryName` are saved from the catalogue when a product inquiry is sent (same function as the dashboard's category chart). Earlier records have none and are listed under no category (nothing is guessed).
4. **One status definition:** `buyerListRules.ts` owns the groups; the dashboard imports the awaiting group from it.
5. **Indexes added** with their reason (`buyer_newest`, `buyer_status_newest`, `buyer_updated`), verified with `explain`.
6. **Blocked, shown honestly:** replies, quotations (the summary says "not connected yet"), real-time updates.
7. **No React Query:** the project has none (CLAUDE.md forbids adding a data library); the page uses `fetch` with request ordering and the address bar as the source of state.

## Security and performance issues found
- The old list returned private message text and delivery location for every row (removed from the list).
- The old routes had no role check (a supplier got an empty list instead of 403).
- The old list had no filters, paging or counts and a hard cap of 100 rows.
- A restored back/forward page showed stale data (found by the tests; fixed).
