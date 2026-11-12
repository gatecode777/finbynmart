# Page 43 — data model and migration notes

**No new quotation collection.** All additions are optional fields on existing documents, so nothing existing needs migrating.

## `quotations` (additive optional fields on `QuotationDoc`)
`revision` (draft concurrency counter, starts at 1, +1 per save; submission also +1), `schemaVersion` (1), `supplierCompanyId`, `draft {input, complete, savedAt}` (the editable working copy, **removed at submission**), `openKey` (`"<inquiryId>:<supplierKey>"` while the lineage is open), `snapshot` (see the calculation policy), `createdBy`, `updatedBy`, `submittedBy` (user ids). For a draft the stored money fields (`unitPriceMinor`, `quantity`, `charges`…) mirror the form where it parses, so the Page 42 list works; `draft.complete=false` makes the list show "Not priced yet".

## New collections
| Collection | Purpose | Indexes |
|---|---|---|
| `idempotency_keys` | one row per (company, user, operation, key) with the request hash and the stored response | unique `idempotency_scope_key`; TTL `idempotency_ttl` (7 days on `createdAt`) |
| `notification_outbox` | a buyer notice owed by a committed supplier action | unique `outbox_dedupe` (`dedupeKey`); `outbox_company_status` (company, status, createdAt) |

## Indexes added on existing collections
- `quotations.quotation_open_per_inquiry`: **unique** on `openKey`, partial (`openKey` exists). One open lineage (draft, sent, revision requested, accepted) per inquiry and seller, enforced by the database; the picker and create path rely on it. A rejected / withdrawn / expired lineage frees the slot (self-healing on the next create). Withdrawal also unsets it.
- `inquiries.supplier_quotable_newest`: `(supplierKey, status, createdAt −1, _id −1)` for the picker (the earlier dashboard index lacks `_id`, so it could not serve the stable sort: the first measurement examined all 1,630 documents; now 20).

## Writes
Create: one `insertOne` (draft). Save: one conditional `updateOne` (status DRAFT and `revision` = the revision the editor holds; 409 otherwise). Submit: **one transaction** — idempotency insert, quotation `DRAFT → SENT` with snapshot, the inquiry's allowed status steps to `QUOTED`, the outbox row. After commit: buyer in-app notice (`notifyBuyer`, deduplicated by `quotation-received:<ref>:<version>`), audit event in `security_events`.

## Deployment requirements
MongoDB must support multi-document transactions (a replica set: Atlas does). `QUOTATION_TAX_RULES` must be configured or submission stays BLOCKED. Delivery of a notice that failed after commit happens when the supplier next opens Quotations or an inquiry; a scheduled processor (none exists) would remove that dependency (BLOCKED).
