# Page 42 — supplier quotation API

All routes: session → `requireSupplierApi()` (401 no session, 403 non-supplier or inactive company) → per-user `rateLimitReserved` → service. The company is the one the session's account owns; `companyId`, `supplierId`, `supplierKey`, `buyerId` or `role` in a query or body is never read. Responses are `{ ok, message?, fields?, data?, meta? }`, `Cache-Control: private, no-store`. Writes also refuse cross-site requests (`isCrossSiteWrite`).

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/supplier/quotations` | list + summary + tab counts + currencies + capabilities | `q`, `status` (all, drafts, submitted, accepted, rejected, expired), `range` (7d, 30d, 90d, this-month, previous-month, custom) with `startDate`/`endDate`, `dateBasis` (created, sent, updated), `validity` (active, expiring, expired), `currency`, `sort` (newest, oldest, updated, valid), `page` (≤1000), `limit` (default 20, max 50). Any bad value: 400 with per-field messages. 240 / min |
| `GET /api/supplier/quotations/summary` | the six lifetime counts | one covered aggregation |
| `GET /api/supplier/quotations/[reference]?version=n` | detail (current version unless `version`) | unknown, malformed and another supplier's reference: the same 404 |
| `GET /api/supplier/quotations/[reference]/versions` | saved versions, newest first (max 20) | same 404 rule |
| `POST /api/supplier/quotations/[reference]/withdraw` | `{ confirm: true, reason? }` | 400 unconfirmed / extra field / reason > 500; 404; 409 not allowed or changed meanwhile; 20 / 10 min. Returns the real new state and `buyerNotified` |
| `POST /api/supplier/quotations/export` | CSV of the current filters | ≤ 5,000 rows, sent in the response (nothing stored); `page`/`limit`/`sort` ignored; 10 / 10 min; logged in `security_events` |

**Deliberately absent** (no foundation; not simulated): `PATCH …/[reference]` (edit draft) → 405, `GET …/[reference]/document` (PDF) → 404, quotation creation/submission (Page 43), buyer acceptance/rejection (Buyer Portal routes only).

## List response
`quotations[]` (row: reference, version, inquiryReference, buyer business name, productName, quantity, unit, currency, `total {text, taxSpecified}`, created/updated/validUntil with labels, `daysLeft` only while open and valid, `status` + `statusLabel`, `detailHref`, `actions {view, withdraw}`) — no events, terms, snapshot, attachments, buyer id, email or phone. `data`: `summary {total, drafts, submitted, accepted, rejected, expired, scope: "lifetime"}`, `tabCounts`, `currencies`, `capabilities {canCreate: false, createReason, canExport, canDownloadPdf: false, pdfReason}`, `noSellers` (the company owns no seller yet). `meta`: `total, page, limit, totalPages`.
