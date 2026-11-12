# Page 42 — quotation status lifecycle

There is **one** lifecycle (`src/lib/quotations/quotationRules.ts`); Page 42 adds no status and no second definition.

Stored: `DRAFT, SENT, REVISION_REQUESTED, SUPERSEDED, ACCEPTED, REJECTED, WITHDRAWN`. Derived at read time with the server clock (never stored, never decided by the browser): `ACTIVE`, `EXPIRING_SOON` (≤ 7 days left), `EXPIRED`.

| Supplier label | Source | Who writes it |
|---|---|---|
| Draft | stored DRAFT | the future creator (Page 43); none exists, so none appear except in tests |
| Submitted / Submitted · Expiring Soon | SENT, valid | the future creator |
| Revision Requested | REVISION_REQUESTED, valid | the **buyer** (`requestRevision`) |
| Accepted | ACCEPTED | the **buyer** only (`decideQuotation`) |
| Rejected | REJECTED | the **buyer** only |
| Expired | SENT / REVISION_REQUESTED past `validUntil` | derived |
| Withdrawn | WITHDRAWN | the **supplier**, via the withdraw route (this page) |
| Superseded | SUPERSEDED | the creator when it adds a newer version; never listed |

Not shown because no data exists: Viewed, Under Review (no buyer-view tracking).

## Tabs
Drafts = DRAFT · Submitted = SENT or REVISION_REQUESTED, not expired · Accepted · Rejected · Expired · All (also holds Withdrawn). A withdrawal is never counted as a rejection or an expiry.

## Supplier-allowed transitions
Only `SENT | REVISION_REQUESTED → WITHDRAWN` on the current, still-valid version. Everything else (accept, reject, edit, revise, re-open) is refused or has no route. Invalid transitions answer 409 with a reason; the unit suite covers the matrix (`W-01`–`W-10`).
