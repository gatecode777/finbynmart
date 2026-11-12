# Page 42 — Supplier Quotations (`/supplier/quotations`)

Owner PRD Page 42 · Portal SUPPLIER · tracker row 45 (same route; the tracker row is updated, not duplicated) · Design reference: the generated Page 42 image was **not available in the repository**, so the page follows `DESIGN.md`, the Page 39 supplier shell and the buyer quotations workspace (Page 29); Design therefore stays In Progress.

## Layout (inside the Page 39 supplier shell; no second header)
Breadcrumb `Home / Supplier Portal / Quotations` → header "Quotations" (Anton) + description + **Export** and **Create Quotation** (disabled, with the reason printed beneath) → six KPI buttons (Total, Drafts, Submitted, Accepted, Rejected, Expired; click = that tab) → status tabs with counts → search + Filters + Sort → optional filter panel (Date + "date applies to", Validity, Currency, Clear all) → results → pagination.

Results: ≥ 900 px a real `<table>` with columns Quotation Ref., Inquiry Ref., Buyer / Company, Requirement / Product, Quoted Amount, Validity, Status, Action; below 900 px each row becomes a card (reference, status badge, definition list, actions). Status is always words + icon. Amount shows the currency symbol and "before tax" when the quotation states no tax.

Detail `/supplier/quotations/[reference]` (read-only): summary, price calculation, commercial terms, product details quoted, related inquiry (reference is not a link: no supplier inquiry page exists), buyer decision, versions, activity, "Not available yet" list, Print and (when allowed) Withdraw.

## States
Skeleton rows (after 250 ms), error with Try again, "No seller is linked to your company yet" (company owns no seller), "No Quotations Yet" (CTA omitted: the inquiries page and creation are not built), "No matching quotations" with Clear, export / withdraw notices (`role=status` / `alert`).

## Behaviour
URL carries `q, status, sort, range, startDate, endDate, dateBasis, validity, currency, page`; changing any filter resets to page 1; stale responses are ignored; search is debounced 300 ms and capped at 60 characters; the list refreshes when the window regains focus. Withdraw opens a native modal (focus trap, Escape, focus return). Export downloads a CSV of the current filters.

## Honest-data rules applied
Counts, statuses, amounts, validity and buyer names are only the server's; nothing is sample data. BLOCKED and shown as such: create / edit draft / revise, PDF (Print instead), order conversion, supplier notifications, amount sorting, buyer and category filters, Viewed / Under review. Reuses `SupplierShell`, the dashboard CSS tokens (page, header, KPI, button); new local components `SupplierQuotationsWorkspace`, `SupplierStatusBadge`, `WithdrawDialog`, `DetailActions` (a shared Modal does not exist in `DESIGN.md` section 6; `WithdrawDialog` is specific and does not claim to be it).

Colours are tokens only (`--primary` #04534F, `--accent` #FDB304, mint/cream backgrounds); fonts Anton (title, KPI numbers) and Montserrat; icons Lucide.
