# Page 44 — Supplier Quotation Details & Version History (`/supplier/quotations/[reference]?version=n`)

Owner PRD Page 44 · Portal SUPPLIER · extends the existing detail route (see the audit). The generated Page 44 design image's text was used for direction (header with reference, status, version and actions; buyer & inquiry context; quoted items; commercial terms; notes and attachments; financial summary; activity; version history; compare; withdraw; back link); its figures (INR 61,500, "non-taxable example") are illustrative and appear nowhere in production data. The page follows `DESIGN.md` and the supplier shell; Design stays In Progress.

## Layout
Breadcrumb `Home / Supplier Portal / Quotations / REF` → **Quotation Details** (Anton) with the reference, the real status badge and tags: `Version N`, `Current offer` / `Historical version` / `Draft: not submitted`, `Accepted version` → actions: **Download PDF** (disabled, reason shown), **Print**, **Edit Draft** or **Create Revision** or **Continue Revision Draft**, **Withdraw quotation** (only on the current version, only when allowed) → banners (success after submission; historical version with "Open the current offer"; draft / revision draft: the buyer cannot see it, amounts provisional, which version they still see; a revision draft exists on the current version; the buyer's pending revision request) → two columns, stacked below 1100 px:
- Main: **Buyer & inquiry context** (business name, supplier as quoted, inquiry link to `/supplier/inquiries/REF`, status, category, requested quantity, delivery location) · **Quoted items** (card; stored name, description, specifications, quantity, unit price, MOQ, discount, tax, line amount, currency, stable line reference; the product's *current* listing linked separately) · **Commercial terms** (lead time, delivery terms, payment, packaging, warranty, validity with "ends 11:59 pm India time", created / submitted) · **Notes** (plain text) and **Attachments** (unavailable, reason) · **Version history** (disclosure; version links, load older) · **Compare versions** (disclosure; two labelled selects).
- Side: **Financial summary** (provisional for a draft; stored amounts; integrity note; where the amounts come from; the tax treatment and policy version recorded) · **Activity** (disclosure, real events) · **Buyer decision** (when recorded) · **Not available yet** (PDF, order conversion, attachments).

## Version selection
Each version in the history is a **link** to `?version=n` (shareable, keyboard and back-button friendly, re-authorised on every load); the selected one carries `aria-current` and a filled marker. An invalid or unknown number is a real 404. Default = the current offer.

## Compare
Choose Before and After, press Compare versions: a summary line ("2 commercial changes, 1 formatting-only") and one **card per difference** with text tags (Added / Removed / Changed; Commercial change / Formatting only; the group), a **Before (version N)** and **After (version M)** value (amounts with their currency symbol) and, for the same currency only, "decrease / increase of …". Cards stack Before over After on a phone; no table, no horizontal scroll. Requests overtaken by a newer one are ignored. Nothing is written.

## Create Revision
A modal states what happens (version N+1 is a **draft**, the buyer keeps seeing version N and is told nothing until it is submitted, version N is never changed), asks for a reason (3–300 characters), and on success opens the Page 43 editor with a revision banner. The idempotency key is kept for retries of the same reason.

## Accessibility
Native `<details>` disclosures, labelled selects, a labelled modal (focus inside, Escape closes, focus returns), text for every status and difference, 44 px controls, print styles hide the controls.
