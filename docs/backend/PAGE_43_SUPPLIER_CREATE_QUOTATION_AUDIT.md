# Page 43 — Supplier Create Quotation: audit (2026-11-12)

Verified in the repository before building. The PRD assumed Page 41 (inquiry details), a supplier inquiry list API, tax configuration, a private upload path, PDF generation, an outbox and multi-line quotation support. At audit time:

| PRD assumption | Repository fact | Decision |
|---|---|---|
| Page 41 inquiry details exist | No (built afterwards, see Page 41 docs) | Page 43 takes the inquiry **reference** only and re-reads the inquiry itself |
| `GET /api/supplier/inquiries` (picker) | Did not exist | Added as the **quotable-inquiries picker** (not the Page 40 workspace) |
| Quotation creation / draft lifecycle | None; `DRAFT` existed in the status type and buyers never see it | Drafts are `quotations` documents with status `DRAFT` (no second collection) |
| Multiple line items | The buyer's quotation pages (29, 30, 35) render **one** product, quantity and unit price per quotation | **One line is the configured maximum** (`MAX_LINES = 1`); the form says why. Raising it needs the buyer views to change first |
| Fractional quantities | Model stores whole quantities | Whole numbers only; fractions refused |
| Approved tax rules | None in the project | Configuration `QUOTATION_TAX_RULES`; **no default**; submission BLOCKED while unconfigured (drafts work) |
| Private attachment upload | Buyer documents and support attachments exist; none that a *buyer can download from a quotation* (`attachmentsDownload: false` on the buyer page) | **BLOCKED**: an upload would never reach the buyer |
| PDF generation | None | **BLOCKED**; not simulated |
| Outbox / retry | None | Smallest compatible: a `notification_outbox` collection written inside the submit transaction, delivered after commit, retried when the supplier next opens a list page |
| Idempotency | None for suppliers | `idempotency_keys` (unique company + user + operation + key, 7-day TTL) |
| Transactions | Not used anywhere before | Verified working on the Atlas deployment (`withTransaction`, snapshot read concern, majority write concern); no partial-commit fallback exists |
| Staff roles | One login per company (the owner) | `SupplierContext.permissions.manageQuotations`; staff submit permission is always true for the owner (revoked membership = suspended company: 403) |
| Inquiry fields: required-by date, target price, attachments | Not captured by the inquiry form | Not shown (the page says so once) |
| Supplier legal address | Not captured (business name and city only) | Shown as name and city, "address not captured" |

## Reused architecture
`quotations` collection and `QuotationDoc`; `money.ts` exact arithmetic; the quotation lifecycle (`DRAFT → SENT`, buyer decisions untouched); `inquiries` lifecycle (`canTransition`, `statusHistory`); `notifyBuyer` + `dedupeKey`; `resolveProduct` for product ownership; the supplier shell, guards, rate limiter (**writes use `rateLimit()`, reads `rateLimitReserved()`**), `isCrossSiteWrite`; the Page 42 list and detail (drafts appear there, Create Quotation is now a real link).

## Defects found by testing and fixed
Partial first save lost the defaults (overlay added); the Page 42 list projection omitted `draft.complete` (a half-filled draft would have shown a total); with no tax configured a draft naming a rule got the wrong message; concurrent same-key requests arriving after the first commit got 409 instead of a replay; **my write routes used the block-reservation read limiter, which over-counts under concurrency (Page 42 withdraw and export had the same defect): writes now use the exact limiter**; the picker's sort needed `_id` in its index.
