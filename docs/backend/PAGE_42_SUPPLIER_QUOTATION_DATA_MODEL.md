# Page 42 — data model

**No new collection and no schema change.** Page 42 reads and (for withdrawal only) updates the existing `quotations` collection; it also reads `inquiries`, `users` (business name), `orders` and `supplier_companies`.

## `quotations` fields used
`reference`, `version`, `isCurrent`, `inquiryId`, `inquiryReference`, `buyerId`, `supplierKey`, `productName`, `productSnapshot`, `currency`, `unit`, `quantity`, `unitPriceMinor`, `discount`, `tax`, `charges`, `moq`, `terms`, `validUntil`, `status`, `decision`, `events[]`, `sentAt`, `createdAt`, `updatedAt` (see `PAGE_42_SUPPLIER_QUOTATIONS_AUDIT.md`). Amounts are integer minor units; totals are never stored, they are computed from the saved snapshot by `totals()`.

## Writes by Page 42
Only `POST …/withdraw`: one conditional `updateOne` setting `status: "WITHDRAWN"`, `updatedAt`, and pushing one `events` entry `{ type: "WITHDRAWN", at, actor: "supplier", reason? }`. The filter repeats `_id`, `supplierKey ∈ sellerKeys`, `isCurrent`, the status read a moment earlier and `validUntil > now`, so a buyer's concurrent acceptance wins. No version is added, no document deleted.

Also written: `notifications` (one buyer in-app notice via `notifyBuyer`, `dedupeKey: quotation-withdrawn:<ref>:<version>`) and `security_events` (`supplier_quotations_exported`: counts and filter names only).

## Indexes added (`collection()` in `src/lib/supplier/quotationService.ts`, idempotent)
| Name | Keys | Serves |
|---|---|---|
| `supplier_current_created` | supplierKey, isCurrent, createdAt −1, _id −1 | default list, Oldest, date window on created |
| `supplier_current_updated` | supplierKey, isCurrent, updatedAt −1, _id −1 | Recently Updated |
| `supplier_current_valid` | supplierKey, isCurrent, validUntil 1, _id 1 | Validity Ending Soon |
| `supplier_current_status_created` | supplierKey, isCurrent, status, createdAt −1, _id −1 | status tabs in the default order, no in-memory sort |
| `supplier_current_summary` | supplierKey, isCurrent, status, validUntil, currency | the counts aggregation, **covered** (0 documents examined) |
| `supplier_reference_versions` | supplierKey, reference, version −1 | detail and versions |

Existing, reused: `quotation_version` (unique reference+version), `inquiry_current`, `one_accepted_per_inquiry`, and the dashboard's `supplier_current_status`. `supplier_current_status` is a prefix of `supplier_current_summary`; it belongs to Page 39 and was left alone.

## Counting definitions
Scope = `supplierKey ∈ company.sellerKeys` and `isCurrent: true`. Per stored status and "validity ended" (`validUntil <= now`): Drafts = DRAFT; Submitted = SENT/REVISION_REQUESTED not ended; Expired = SENT/REVISION_REQUESTED ended; Accepted; Rejected; Total = every current version (Withdrawn included, no card).

## Versioning
See `PAGE_42_QUOTATION_VERSIONING.md`. Currency is stored per quotation; nothing is converted or summed across currencies.
