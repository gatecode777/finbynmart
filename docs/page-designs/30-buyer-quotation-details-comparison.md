# Page 30 — Buyer Quotation Details & Comparison (with Page 29, My Quotations)

Routes (buyer only): `/buyer/quotations` (list, Page 29 entry point), `/buyer/quotations/[reference]` (details, tracker ID 101), `/buyer/quotations/compare?refs=A,B,C` (comparison, tracker row 29). References: `FBM-QT-XXXXXXXX`. Page 29's own PRD never arrived: its list was built from the reference image only and is documented here. Design reference images: the owner's Quotation Details, Comparison and My Quotations screens (not stored in the repo).

Design system: buyer shell (minimised sidebar, gold active item), teal/gold tokens, Anton headings, Montserrat body, shared `Modal`/`ConfirmDialog`, `Toast`, inquiry list/detail card styles. No new colours, no new libraries; Lucide icons only.

## My Quotations (`/buyer/quotations`)

Heading "My Quotations"; five KPI cards (Total, Active, Expiring Soon, Accepted, Rejected) from real counts; tab group (All, Active, Expiring Soon, Revision Requested, Accepted, Rejected, Expired, each with its count); search (reference prefix, inquiry reference, product, supplier; literal text, debounced) and sort (Recently Received, Oldest First, Valid Till); table at wide widths and cards on phones; row checkbox to pick quotations for comparison (max 4, "Compare Selected" appears from 2; picking changes nothing); pagination; URL carries q, status, sort, page; stale restore after Back; honest empty states ("No Quotations Yet" explaining that suppliers cannot send quotations yet; "No matching quotations"; error with Try again).

## Quotation Details (`/buyer/quotations/[reference]`)

Heading "Quotation Details & Comparison", breadcrumb Home / Buyer Dashboard / Quotations / reference. Header actions: Back, Compare Quotations (when other quotations of the inquiry exist), Print / Save. Decision bar (only the actions allowed now): Accept Quotation, Reject Quotation, Request Revision. Five sections: Quotation Details (summary, supplier, inquiry, exact price breakdown, commercial terms with "Not Provided", product snapshot, attachments list), Compare Quotations (other quotations of the same inquiry), Revision History (versions and what changed), Inquiry & Timeline, Messages (honestly unavailable). `?version=N` opens an earlier version read-only; `?tab=` selects a section.

Dialogs: Accept (ConfirmDialog: names reference, version, supplier, quantity, price, total, validity; says it records the decision only), Reject (alertdialog with optional reason), Request Revision (reason select + message, validated before sending). Focus moves in, Escape closes, focus returns.

## Comparison (`/buyer/quotations/compare`)

Two to four quotations of one inquiry: table ≥ 900px, one card per quotation below. "Differs" word on differing rows, compatibility notices (currency, unit, quantity, expired), "Not Provided" for missing terms. No ranking, no best-value label, no recommendation.

## Honest limits (BLOCKED)

Supplier quotation creation, supplier notification, messaging, attachment download, order creation after acceptance, PDF generation (print / browser "Save as PDF" is offered). See `docs/backend/PAGE_30_QUOTATION_DETAILS_AUDIT.md`.

## Print

`noPrint` hides header actions, decision bar and tabs; the workspace chrome (top bar, sidebar) is hidden by the shell's print rules; the printout is the quotation only.

## Responsive and accessibility

Layouts use grid/flex with `minmax(0, 1fr)`; tested at 16 widths (320–2560). Tabs are a labelled `nav`; tables have captions and scoped headers; status is text plus colour; dialogs are accessible (focus trap, Escape, return); reduced motion respected through the shared styles. Contrast was not measured with a tool.
