# Page 28 — Buyer Inquiry Details (`/buyer/inquiries/[reference]`)

Owner PRD Page 28. Tracker row 27 (baseline "Inquiry Details", `/account/inquiries/[id]`), route moved into the buyer workspace and keyed by the reference. Role: authenticated buyer only. Reference image: the owner's generated "Inquiry Details" screen (it shows five suppliers, two quotations, messages, revisions and an order flow, none of which exist; see the audit).

## What the page shows (everything from the saved inquiry)
- Shared buyer shell, **My Inquiries** current. Breadcrumb Home > Buyer Dashboard > My Inquiries > reference; heading "Inquiry Details" and the PRD's description; **Back to My Inquiries** and **More Actions** (Print Inquiry Details; Cancel Inquiry only when allowed; no inactive items).
- **Overview card:** product thumbnail (or a neutral icon for a general inquiry; never another product), reference, product or inquiry-type title, type and category, submitted and last-updated time (India time), the status in words, its explanation, and a note when the product is no longer listed (the saved name stays).
- **Inquiry Progress:** the reused Page 14 timeline built from `statusHistory`: Inquiry Submitted, Supplier Review, Supplier Response / Quotation, and a closing step only for a final status, each with its real time; below it the honest notification line ("the supplier is not told automatically").
- **Requirement Details:** product and category, type, quantity with unit, delivery location, the buyer's own message (plain text, "Show the full message" for long ones). Target price and required-by date are not collected by the inquiry form, so they are not shown.
- **Attachments:** "No attachments. Files cannot be added to an inquiry yet."
- **Tabs** (real ARIA tabs, arrow keys, Home/End): Supplier Responses, Quotations, Messages, each saying plainly that the module is not connected yet.
- **Inquiry History:** the persisted status changes with actor and time.
- **Right column:** Inquiry Summary (reference, type, status, "Responses Received" and "Quotations Received" as "Not available yet", submitted, updated; no supplier count, no "valid until"), Supplier (the single recipient, location and type from its record, link when it still has a page, never "verified" unless its record says so), Next Steps by status.
- **Action bar:** Cancel Inquiry (when allowed) and Print / Save Inquiry Details. No Select & Proceed, Request Revision, View Quotation, Message Supplier or Compare: they depend on quotations, messaging and orders.

## Behaviour
- Cancel uses the shared alert dialog and the same service as Page 27; after the server confirms, a toast shows and the page refreshes from the server (status, timeline, history, no cancel action).
- Print uses the browser's print dialog (which can save a PDF); a print stylesheet hides the sidebar, top bar, buttons and toast so the printout is the inquiry only.
- Unknown, another buyer's, guest and malformed references show the site's 404 page; only an old record without a reference opens by its id. A database error shows a scoped error page with Try again. No `loading.tsx` above the page (it can 404 and redirect).
- Responsive: one column on phones; overview, then progress, requirement, attachments, tabs, history, then the summary column; two columns from 1100px. Tabs scroll horizontally on narrow screens.

Report: `docs/page-reports/28-buyer-inquiry-details-report.md`.
