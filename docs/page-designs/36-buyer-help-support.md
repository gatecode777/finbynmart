# Page 36 — Buyer Help & Support

Route: `/buyer/support` (buyer accounts only, noindex). Ticket page (stand-in for Page 37): `/buyer/support/tickets/[ticketReference]`.
Reference: the owner's generated Help & Support layout (summary cards, Raise a Support Ticket, My Support Tickets, FAQs, Other Ways to Get Help).
Design system: `DESIGN.md` only. No new tokens. The page reuses the buyer shell, the dashboard page header, the inquiries list/button/dialog classes and the shared `Modal`.

## Layout
1. Breadcrumb: Home / Buyer Dashboard / Help & Support. Heading, one-line intro. Header actions: **Contact Support** (links to the Contact Us form `/contact-us`) and **Raise a New Ticket** (jumps to the form).
2. Four summary cards from real counts: My Tickets, Open Tickets, In Progress, Resolved.
3. Two columns from 1100px: **Raise a Support Ticket** (left) and **My Support Tickets** (right). Below 1100px they stack.
4. **Frequently Asked Questions** (accordion) and **Other Ways to Get Help** side by side from 1100px.

## Raise a Support Ticket
Issue category (required, 11 categories), Related To (optional: Inquiry, Quotation, Order, Product; the record picker lists only the buyer's own records), Subject (5–150), Description (10–1,000, with a counter), Attachments (optional: PDF, JPG, PNG; at most 5 files, 10 MB each by default; drag and drop or click; per-file progress bar), Submit Ticket, Reset.
Validation runs in the browser and again on the server; the server is authoritative. Success is shown only after the ticket is stored: the form is cleared, the new ticket is the first row and the My Tickets number goes up. The confirmation states plainly that **no support team replies through this site yet**.

## My Support Tickets
Table from 900px: Ticket ID, Subject, Category, Related To, Status, Last Update, Actions (View). Cards below 900px. The table is compact (wraps the reference, the status badge and the date) so all seven columns are visible without scrolling at 900–2560px.
Search (debounced; ticket reference prefix, subject, related reference), Filters dialog (status, category, related module, date range with custom dates), Sort (newest created, oldest created, recently updated), pagination (20 per page, max 50). Everything is in the address bar and survives reload and back/forward.
States: loading, honest empty state ("No Support Tickets Yet" with Raise a New Ticket), no-results with Clear all filters, error with Retry.

## FAQs
14 published how-to answers about features that exist today (account, products, suppliers, inquiries, quotations, orders, technical). Category and search narrow the list. Every question is a button with `aria-expanded`/`aria-controls`.
Not included: payments, delivery times, returns, refunds, fees, response times (none of these policies exist).

## Other Ways to Get Help
Support Ticket (always), Contact Us form (always), **Live Chat shown as "not available yet"**. A support e-mail, phone number and opening hours appear only when `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_HOURS` are configured and valid. None is configured, so none is shown. Nothing is ever labelled "Online".

## Ticket page (compact, until Page 37)
Reference, subject, status badge, category, related record link, created/updated, description as written, attachments with owner-checked download links, buyer-visible history, and a note that no support team replies through this site yet. No reply box, no reopen or close button (they would not work).

## Responsive and accessibility
Checked at 16 widths 320–2560 (no overflow, clipped text or console errors). Phone: cards and one column. Filters open as a focus-trapped dialog that closes on Escape. All fields labelled; required fields announced; status shown in words with an icon, never by colour alone.
