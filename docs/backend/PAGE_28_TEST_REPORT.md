# Page 28 — Test report

Run 2026-11-04 on the throwaway database `finbynmart_test` (dropped at the end), Chrome headless. The checks live in `27-28-buyer-inquiries-test.mjs`: groups A and B (access and ownership, shared with Page 27), M (detail API and page), O (responsive), J (cancellation) and L (list page).

**Result:** the whole suite 100/100 with the performance group on the final build; Pages 13 (241/241), 14 (124/124), 22 (96/96), 23 (102/102), 24 (85/85), 25-26 (91/91) re-run after the shell, toast, dialog and link changes and passing (the details-page overview fix that followed is CSS only).

## Details-page checks (M-01 to M-15)
API: reference, status, label, dates, supplier, quantity and unit, timeline and the history; **capability flags all false except cancellation (when eligible) and print**; no internal or private fields; the history is the saved one · Page: buyer shell with My Inquiries current, heading, breadcrumb ending in the reference, no console errors; overview, requirement and message (as text); the timeline shows only recorded steps (Inquiry Submitted and Supplier Review completed for IN_PROGRESS, no quotation or closing step); everything that does not exist says so and there is no Select & Proceed, Request Revision, View Quotation or Message Supplier control; the three tabs are real tabs (click, arrow key and focus, honest panels); next steps, supplier (single recipient) and history panels; More Actions lists only Print Inquiry Details and Cancel Inquiry; print media hides the top bar, sidebar and buttons; the cancel dialog asks first, Escape keeps the inquiry, confirming writes CANCELLED with history, shows the toast and the page shows Cancelled, no cancel action and the final step; a closed inquiry offers no cancel, says it is final and suggests a new inquiry; another buyer's reference shows the 404 page with nothing of that inquiry · Responsive: the details page at 16 widths (320 to 2560) with no overflow, clipping or controls outside the viewport; screenshots at 1440, 820 and 390.

## Not testable (blocked features, no tests invented)
Supplier responses, quotations (versions, expiry, wrong-buyer, drafts), messaging (authorisation, pagination, realtime), attachments (signed URLs, ownership), revision requests, quotation selection (concurrency, duplicate orders, order flow), PDF export. Their contracts and the tests required when they are built are in the matching `PAGE_28_*` notes.

## Not run
Lighthouse, contrast tool, Firefox, Safari, real devices, landscape, browser zoom, screen reader, the details page under concurrent load. Screenshots: `docs/page-reports/screenshots/28-buyer-inquiry-details-{desktop-1440,tablet-820,mobile-390}.png`.
