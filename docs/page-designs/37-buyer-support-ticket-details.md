# Page 37 — Buyer Support Ticket Details

Route: `/buyer/support/tickets/[ticketReference]?tab=conversation|timeline|attachments|related` (buyer accounts only, noindex, never cached).
Reference: the owner's generated Page 37 image. Design system: `DESIGN.md` only; the buyer shell, inquiry-detail cards and tabs, inquiries buttons, `Modal`, `Toast` and the Page 36 form fields are reused. New styles: `TicketDetails.module.css` (summary strip, conversation, composer, timeline, files, info and feedback cards).
Modifies the compact page built with Page 36 in place (same route, same components family); it is not a second page.

## Layout
1. Breadcrumb Home / Buyer Dashboard / Help & Support / Ticket Details / reference. Heading "Support Ticket Details" and the PRD's one-line description.
2. Actions: **Back to All Tickets** (returns to the list with the search and filters it had) and **Reopen Ticket** (only when the server says it is allowed).
3. Summary card: Ticket ID with a copy button, Subject, Category, Status badge, Created On, Last Updated.
4. Two columns from 1100px: tabs card (left) and right column (Ticket Information, Related record card, feedback card). One column below 1100px.

## Tabs (accessible, arrow keys / Home / End, address `?tab=`)
- **Conversation**: the persisted, buyer-visible messages, oldest first; the newest 20 load first and "Show earlier messages" walks back; the buyer's original description is the first message. Buyer messages show "<name> (You)" with initials; support messages "Finbyn Mart Support" with a headset avatar. Text is shown as text (line breaks kept, long words wrap). Files are download chips. No "seen/delivered" labels (not recorded). Refresh button; the page also refreshes when it becomes visible again after a minute in the background (no timer polling). Below: the reply box (message 2–2,000 characters with counter, Attach Files with a preview list, remove, progress bar, Send Reply), or, when the status does not allow a reply, the reason and a Reopen button. Until a support reply is recorded the page says so.
- **Timeline**: recorded events and replies, oldest first, 20–50 per page ("Show later activity"). Loaded the first time the tab opens.
- **Attachments**: every downloadable file grouped as Original ticket submission, Your replies, Support replies; name, type, size, sender, date, Download. No preview (download only).
- **Related Details**: the inquiry, quotation, order or product the ticket is about, read again now.
A draft reply survives switching tabs. Each tab has its own loading, empty and error state; one failing does not blank the others.

## Dialogs and cards
- **Reopen Ticket** dialog: required reason (10–1,000), closes only after the server confirmed; Escape and the backdrop are ignored while sending; focus returns to the button.
- **Was your issue resolved?** (resolved or closed tickets, once): 1–5 stars, optional comment (1,000), Submit disabled until a star is chosen; after saving it shows "You rated this ticket N out of 5".

## Not shown (not supported)
Priority (the server sets one value, it means nothing to a buyer), More Actions, Request Closure (no closure-request policy exists), read receipts, previews, a support agent's name.
