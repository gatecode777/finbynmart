# Page 30 — Quotation API

All routes: buyer session required (401 without, 403 for a supplier, 401 for a suspended or revoked session). Responses are `Cache-Control: private, no-store`. The buyer always comes from the session; any `buyerId` parameter is ignored. Code: `src/app/api/buyer/quotations/**`, `src/lib/quotations/`.

| Method and path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /api/buyer/quotations?q&status&sort&page&limit` | The buyer's current quotations (one entry per reference), tab counts and summary. `status`: all, active, expiring, revision, accepted, rejected, expired. `sort`: received, oldest, valid. `limit` ≤ 50. | `{ ok, quotations[], data:{tabCounts,summary}, meta }` | 400 invalid filters |
| `GET /api/buyer/quotations/{reference}[?version=N]` | One quotation (current version, or an earlier one by number) with supplier, inquiry, price breakdown, terms, snapshot, attachment list, version history (≤ 20), events, timeline, related quotations, decision, pending revision and `capabilities`. | `{ ok, data }` | 404 for unknown, malformed, draft, other buyer's reference or bad `version` (identical body) |
| `POST /api/buyer/quotations/compare` `{references:[2..4]}` | Side-by-side comparison of the buyer's own current quotations for **one** inquiry. Changes nothing. | `{ ok, data:{columns,fields,compatibility,inquiry} }` | 400 count / different inquiries / malformed, 404 any not the buyer's |
| `POST …/{reference}/accept` `{version,confirm:true}` | Accept that exact version. | `{ ok, status, supplierNotified:false, message }` | 400 validation, 404, 409 `STALE` / `NOT_ALLOWED` / `ALREADY_ACCEPTED` |
| `POST …/{reference}/reject` `{version,confirm:true,reason?}` | Reject that exact version. | same | same |
| `POST …/{reference}/revision-request` `{version,reason,message}` | Save a revision request (reason: PRICE, QUANTITY, DELIVERY, PAYMENT, SPECIFICATIONS, OTHER; message 10–1000 chars). | 201 `{ ok, supplierNotified:false }` | 400, 404, 409 |

DELETE, PUT and PATCH are not exported (405): a buyer cannot edit or delete a quotation.

Write pipeline: session → rate limit (`quotation-decision` 30 / 10 min, `quotation-compare` 120 / 10 min) → reference pattern → body size limit → strict validation (unknown fields refused, no `<` or `>`) → service. Version history is part of the detail answer (a separate history route would be a second query for at most 20 small rows).

Indexes (collection `quotations`): `quotation_version` unique (reference, version); `buyer_current_received` (buyerId, isCurrent, sentAt desc, _id desc); `buyer_current_status_valid` (buyerId, isCurrent, status, validUntil); `inquiry_current` (inquiryId, isCurrent, sentAt desc); `one_accepted_per_inquiry` unique partial (inquiryId, accepted) where `accepted: true`.
