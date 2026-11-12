# Page 43 — Supplier Create Quotation (`/supplier/quotations/create`)

Owner PRD Page 43 · Portal SUPPLIER · new route (the tracker's existing row 43 is a different page; this one is tracked under its own ID, see the tracker log). The generated Page 43 design image's text was used for direction (inquiry context, quotation details, products & pricing, delivery & payment, notes & attachments, a live summary, Save Draft / Preview / Submit); its figures (500 m × INR 120.00, freight 1,500.00, total INR 61,500.00, a "non-taxable example") are illustrative: they exist only as a **test fixture** and appear in no production data or default. The page follows `DESIGN.md` and the supplier shell; Design stays In Progress.

## Two states of one route
1. **Picker** (no `?inquiry` / `?reference`): **Choose an inquiry to quote** — a searchable, paged list (20, max 50) of the company's own quotable inquiries (open, registered buyer, addressed to an owned seller, no open quotation). Each row: reference, buyer business name, product / category, quantity, requested date, status; the action is a real link to `?inquiry=REF`. The empty state says why (closed, cancelled and declined inquiries and inquiries from guests without an account cannot be quoted) and a search with no match says so separately.
2. **Builder** (`?inquiry=FBM-INQ-…` creates or reopens the draft; `?reference=FBM-QT-…` opens a draft or a revision draft): a context strip **Inquiry being quoted** (buyer business name only, requested date, quantity, delivery place, link to Page 41) above four numbered sections and a summary.

## Builder sections (single column, summary beside it from 1100 px)
1. **Quotation details** — currency, **Valid until** (a date; ends 11:59 pm India time; the server checks the date, not the device clock; at most the configured maximum number of days) and the supplier (read-only; "Address details are not captured yet").
2. **Products & pricing** — one line item per quotation: item source (catalogue product of the company, or typed), item name, unit, quantity (whole numbers), unit price, optional MOQ, discount (none / percent / amount) and **Approved tax treatment** (only treatments from `QUOTATION_TAX_RULES`; none configured = the control says so, drafts still save and submission is blocked; no rate is ever assumed). "Remove" is disabled with a reason because a quotation needs one line.
3. **Delivery & payment** — lead time (days), delivery terms (select), delivery destination (set by the buyer, read-only), payment terms (select; **Advance (%)** or **Days to pay** appear for the matching choice), freight (added after tax, not taxed), and extra charges (name + amount; add / remove).
4. **Notes & attachments** — plain-text notes; attachments are **unavailable** (no upload module exists) and the section says so in words.

## Summary (server-calculated)
Subtotal, discount, taxable amount, tax, charges, **Total**, always with currency and "before tax (no tax stated)" when none applies. The browser mirrors the server's arithmetic for instant feedback (tested for parity on six inputs) but **Preview** asks the server and **Submit** recalculates and refuses a total that differs. On a phone the summary is a collapsible block above a **sticky action bar** (Save Draft · Preview · Submit); at desktop the summary is sticky beside the form.

## Actions
**Save Draft** (revision-guarded; a stale save opens a conflict panel with Reload), **Preview** (modal: exactly what the buyer will see; writes nothing), **Submit** (review dialog → idempotent transaction → redirect to Page 44 with a success banner). Errors: a summary at the top lists every problem as a link to its field (focus moves there); each field has a text message, never colour alone; a network failure keeps every typed value and says nothing was sent.

## States
Empty picker, no tax configured (drafts work, submission blocked, in words), closed or already-quoted inquiry (identical 404 for foreign / unknown), draft saved, conflict, submitting, submitted, failed (retry-safe).

## Accessibility
Labelled fields, numbered `h2` sections, error summary with focus, `aria-live` for save status, labelled modals (focus trap, Escape, focus return), 44 px controls, keyboard order = visual order, no horizontal scroll from 320 px.
