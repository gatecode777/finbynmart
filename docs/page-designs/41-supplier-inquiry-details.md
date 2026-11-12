# Page 41 — Supplier Inquiry Details & Response (`/supplier/inquiries/[inquiryReference]`)

Owner PRD Page 41 · Portal SUPPLIER · The generated Page 41 design image was **not in the repository**; the page follows `DESIGN.md`, the supplier shell and the Page 39 / 42 / 43 patterns, so Design stays In Progress. The tracker's existing row 44 / 108 are different inquiry pages; this PRD number takes a new tracker ID (see the tracker).

## Layout (inside the supplier shell; "Inquiries & Leads" is highlighted but is not a link: its list page, Page 40, is not built)
Breadcrumb `Home / Supplier Portal / Inquiries & Leads / REF` → "Inquiry Details" (Anton) with the reference, the real status badge and the received time → one action: **Create Quotation** (gold) / **Continue Draft** / **View Quotation** / disabled with its reason → two columns (stacked below 1100 px, no slider):
- Main: **Original Requirement** (title, the buyer's message with an accessible show-full / show-less toggle for long text, inquiry type, category, quantity, delivery location, the listing's specifications as generic label / value pairs, one note that the form does not capture target price / required-by date / attachments) · **Buyer Attachments** (unavailable, with the reason) · **Respond to Buyer** (ARIA tablist: Send Response / Ask Clarification; plain-text box, 2,000-character counter, error summary, status announcements) · **Previous Responses** (newest first, "Load older messages", honest note that read receipts are not tracked).
- Side: **Buyer Information** (native disclosure: business name and account type; contact details are not shared; no verification badge or rating) · **Inquiry Activity** (real events) · **Related Quotations** (reference link, status, total, validity, Continue draft).
Footer: **Back to Dashboard** (with the reason: the inquiries list is not built).

## Behaviour
Opening the page creates and changes nothing. Send: the message stays in the box until the server has saved it; failure (network, 503) keeps the text and says nothing was sent; the same text retries with the **same** idempotency key (a lost answer cannot send twice), changed text gets a new one; the button is disabled while sending (the server is what prevents duplicates). Success: a status message built from the server's result (recorded / queued / no notice recorded), the box clears, the persisted message appears, `router.refresh()` re-reads the status, timeline and quotation action. A closed / cancelled / declined inquiry, a missing permission or a vanished inquiry replaces or disables the form with the reason and keeps the typed text. Nothing is stored in browser storage.

## Accessibility and responsive
Real labels, `aria-invalid` + `aria-describedby`, focusable error summary, tablist with roving tabindex and arrow / Home / End keys, `role=status` / `alert`, 44 px controls, reduced-motion safe. Tested widths and gaps are in the test report.

## Integrations
Create Quotation passes **only the inquiry reference** (`?inquiryReference=`); Page 43 re-reads the inquiry, re-checks ownership and eligibility, and continues an existing draft instead of creating another. The buyer's inquiry page shows the supplier's messages. Inquiry references on the dashboard, the Quotations list / detail and the create page now link here.
