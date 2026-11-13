# Automatic matching lead distribution: PRD and implementation notes

Status: Design Complete (requirements given by the owner), Development **Implemented**, QA **Not Started / BLOCKED** (no isolated, transaction-capable database was available, see `TEST_REPORT.md`). Not deployed; no historical inquiry is redistributed.

## Implementation map
| Concern | Existing (reused) | Added |
|---|---|---|
| Inquiry | `inquiries` collection, `submitInquiry` (idempotency key, duplicate window, reference), `/api/public/inquiries` | `distributionPolicy`, `matchedSupplierKeys` fields; the inquiry and its job are written in one transaction |
| Recipients | `inquiries.supplierKey` = DIRECT provenance (never overwritten) | `inquiry_recipients` (MATCHED; unique `inquiryId + companyId`), `matchedSupplierKeys` on the inquiry for indexed supplier access |
| Distribution | none | `distribution_jobs` (unique per inquiry), worker `runDistribution`, `POST /api/internal/distribution` |
| Supplier access | `loadInquiry`, response, quotation, revision, order link | all go through `src/lib/leads/access.ts` `findInquiryFor` / `advanceStatus` |
| Notices | `notifySupplier` + preferences | recipient `notice` state (PENDING, DONE, SKIPPED_PREFERENCE, NOT_RECORDED), swept by the worker |
| Quotation / order | unchanged engines, immutable versions, `order_per_quotation` | none: each recipient quotes with its own supplier key; acceptance still creates only an explicitly confirmed order |
| Buyer | inquiry details, quotation list | matching status section, offers labelled by origin, form notice, success state |

## Flow
1. Buyer sends a product inquiry (registered buyer, catalogue product). The server resolves product and supplier (existing checks), stores the inquiry **and** a `PENDING` job in one transaction. Failure = nothing stored, no success shown.
2. Response includes the real reference. The UI shows the distribution state from the job (`Processing` first). A best-effort pass runs after the response (`after()`); the stored job is the durable guarantee.
3. The worker claims a job with an atomic lease (60 s, renewed per batch), freezes candidates once, then creates recipients in batches (default 20, **not a cap**; the loop continues until the frozen list is exhausted or the pass budget ends, then the next pass resumes at the cursor).
4. Each recipient is one transaction: inquiry still open? company active and still owns the seller? insert recipient (unique), `$addToSet matchedSupplierKeys`. A duplicate-key means "already done".
5. Notices are a separate durable step: the recipient row is created with `notice.state = PENDING`; delivery happens after commit and by a sweep, so a crash cannot lose it. Preferences suppress the notice only (`SKIPPED_PREFERENCE`); the inbox record always exists.

## States (job)
`PENDING` and `PROCESSING` show as "Processing"; `COMPLETED`; `NO_MATCHES` ("No eligible matches"); `PARTIAL` (retry pending, bounded exponential backoff 30 s to 15 min); `FAILED` (after 6 attempts: visible, operator retry); `STOPPED` (inquiry closed or cancelled: checked before every recipient). Recipients already committed and quotations are never deleted.

## Worker and deployment
`POST /api/internal/distribution` with `Authorization: Bearer $DISTRIBUTION_WORKER_SECRET` (min 24 characters; unset = endpoint returns 503, it never runs unauthenticated). Body `{}` runs one bounded pass (5 jobs x 25 batches); `{"action":"retry","reference":"FBM-INQ-..."}` re-arms a FAILED/PARTIAL job. Responses contain counts only. **No scheduler exists or was deployed by this work**: until something calls the endpoint regularly (Vercel Cron, an external cron, an operator), only the best-effort post-response pass runs and unfinished jobs stay `PARTIAL`/`PENDING` (visible to the buyer as "Processing"). A recommended cadence is every minute.

## API (new or changed)
- `POST /api/public/inquiries` (existing): unchanged contract; follow-up state is read from the buyer inquiry detail and the success page.
- `GET /api/supplier/inquiries/list?kind=direct|matched&tab=&q=&page=&limit=` (extended): `kind=matched` lists the company's own recipient rows (business names only).
- `GET /api/supplier/inquiries/[reference]` and the response/quotation routes (existing): reachable for a DIRECT address **or** an active MATCHED recipient relationship; otherwise the same 404.
- `POST /api/internal/distribution` (new, secret protected): 401 bad secret, 503 not configured, 422 bad reference, 409 nothing to retry, 429 throttled.
All other status codes follow the existing routes (401/403/404/409/413/422/429).

## Indexes (created on first use)
`distribution_jobs`: unique `{inquiryId}`, `{state, nextAttemptAt}`. `inquiry_recipients`: unique `{inquiryId, companyId}`, `{companyId, createdAt, _id}`, partial `{notice.state, createdAt}` (PENDING only). `inquiries`: `{matchedSupplierKeys, createdAt, _id}` and `{matchedSupplierKeys, status, createdAt, _id}`. No existing index was changed; no uniqueness migration is needed (new collections). Existing inquiries have no job and are **never** redistributed (a historical redistribution needs a separate approved migration).

## Known gaps and decisions needed
- Supplier dashboard counts and analytics count DIRECT inquiries only; matched leads are listed in the inbox with their own count.
- The quotation picker lists matched inquiries by the shared inquiry status; the recipient's own status is authoritative inside the inquiry.
- `/supplier/inquiries?kind=matched` runs one bounded aggregation over the company's own recipient rows (capped at 5,000); a denormalised closed flag would remove the lookup.
- Approved MongoDB supplier products and sample listings are not match sources (see `MATCHING_POLICY.md`).
- Attachments to inquiries do not exist; recipient-scoped attachment access is therefore not built (a future attachment must default to direct-only).
- Contact disclosure to matched suppliers, requirement edits and redistribution after an edit: not built (no edit exists).
- The 2,000-company cap and the cutoff-at-first-run rule are product decisions to confirm.
