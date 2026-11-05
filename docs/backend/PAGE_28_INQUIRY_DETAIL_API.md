# Page 28 — Inquiry detail API

`GET /api/buyer/inquiries/[id]?view=detail` (id = reference, or the id of an old record without a reference). Buyer session required (401, 403 for suppliers), `private, no-store`. Another buyer's, unknown, guest and malformed references: the same 404. Without `view=detail` the route returns the earlier owner-only record (`{ ok, inquiry }`) unchanged.

Cancel: `PATCH /api/buyer/inquiries/[id]/cancel` (see `PAGE_27_CANCELLATION_RULES.md`), by reference or id.

## Answer `{ ok: true, data }`
`reference`, `inquiryType`, `inquiryTypeLabel`, `status`, `statusLabel`, `statusText`, `businessLabel`, `submittedAt`/`submittedLabel`, `updatedAt`/`updatedLabel`, `supplier { name, slug, url, initials, location, kind, verified, rating, photos, available }`, `product { name, slug, url, imageSrc, imageRemote, price, unit, moq, available }` or null, `categoryName`, `quantity`, `unit`, `deliveryLocation`, `message` (the owner's own text), `timeline[]`, `notification { state, label }`, `history[] { from, to, toLabel, actor, at, atLabel, reason }`, `canCancel`, `key`, `viewer: "buyer"`, `capabilities`.

`capabilities` = `{ messaging:false, supplierResponses:false, quotations:false, revisionRequests:false, quotationSelection:false, attachments:false, cancellation:<eligible>, print:true, pdfExport:false }`. A flag is true only when the backend behind it exists and the buyer may use it.

Never present: buyer id, idempotency key, consent record, internal notification record, guest data, supplier contact fields, e-mail or phone of anyone. (Tested.)

## Not provided
`/timeline`, `/attachments`, `/export`, `/responses`, `/quotations`, `/messages`, `/select-quotation`, `/revision-request`, `/api/buyer/quotations/[id]`: not created (no data behind them; see the audit). Add each together with its module, using this answer's `capabilities` flag.

## Performance
Detail API p95 99–106 ms from 100 to 20,000 inquiries stored (target 350). One indexed read by `reference`, no related collections to load. See `PAGE_27_PERFORMANCE_REPORT.md`.
