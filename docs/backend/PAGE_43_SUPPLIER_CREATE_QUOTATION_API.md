# Page 43 — API contract

All routes: session → `requireSupplierApi()` (401 / 403) → rate limit (**writes: exact `rateLimit`**, reads: reserved) → service. Company, seller, buyer and inquiry come from the session and the inquiry record; any `supplierKey`, `buyerId`, `status`, total or `createdBy` in a request is ignored (or refused). Responses are `{ ok, message?, code?, fields?, data?, meta? }`, `Cache-Control: private, no-store`. Writes refuse cross-site requests (403) and bodies over 24 kB (413); a non-object body is 400. Business failures: **404** (inquiry / quotation not the company's, unknown or malformed: identical), **409** (`STALE_REVISION`, `NOT_A_DRAFT`, `ALREADY_QUOTED`, `INQUIRY_CLOSED`, `NOT_ELIGIBLE`, `TOTAL_CHANGED`, `TAX_POLICY_CHANGED`, `IDEMPOTENCY_CONFLICT`), **422** (`VALIDATION` with `fields`, `TAX_UNRESOLVED`), 429, safe 503.

| Route | Purpose |
|---|---|
| `GET /api/supplier/inquiries?q=&page=&limit=` | the quotable inquiries (own sellers, registered buyer, not closed / cancelled / declined), newest first, 20 per page (50 max) |
| `GET /api/supplier/inquiries/[reference]/quotation-context` | the inquiry as recorded, eligibility, any open quotation, defaults, configured options, capabilities (attachments / PDF / second line: unavailable with reasons) |
| `GET /api/supplier/quotation-products?q=&page=&limit=` | search the company's OWN products only (20 / 50) |
| `POST /api/supplier/quotations` `{inquiryReference, input?}` | create a draft (201) or return the existing one for that inquiry (200, `created:false`) |
| `PATCH /api/supplier/quotations/[reference]` `{expectedRevision, input}` | save the draft; stale revision → 409 and nothing is overwritten |
| `GET /api/supplier/quotations/[reference]/draft` | the editable draft, revision, server calculation, options |
| `POST /api/supplier/quotations/[reference]/preview` `{input?, expectedRevision?}` | validate and calculate exactly as submit would; writes and sends nothing |
| `POST /api/supplier/quotations/[reference]/submit` `{confirm, expectedRevision, expectedTotal, expectedTaxRuleVersion, idempotencyKey}` | atomic, idempotent submission (the key may be the `Idempotency-Key` header). Replay → 200 `replayed:true`; changed body → 409 |

Not created (BLOCKED): `…/pdf`, attachment upload / download routes.

`input` fields (allow-list; everything else dropped): `currency`, `validUntil` (YYYY-MM-DD, ends 23:59:59.999 India time), `lines[0]` {`id`, `source` INQUIRY / CATALOGUE / MANUAL, `productKey`, `name`, `quantity`, `unit`, `unitPrice`, `moq`, `discountKind`, `discountValue`}, `taxRuleId`, `freight`, `charges[≤3]` {label, amount}, `leadTimeDays`, `deliveryTerms` (EXW FCA FOB CIF DAP DDP), `paymentType` (ADVANCE, ON_DELIVERY, NET_DAYS) + `advancePercent` / `netDays`, `notes` (≤ 500, plain text).
