# Page 28 — Cancellation rules

Page 28 reuses the Page 27 rules and service without change; see `PAGE_27_CANCELLATION_RULES.md`. Summary for this page:

- **Allowed** only for NEW, NOTIFIED and IN_PROGRESS (and old lowercase `new`), only for the owner, through `PATCH /api/buyer/inquiries/[reference]/cancel`.
- **Where:** More Actions and the bottom action bar, both only when `canCancel`; both open the shared alert dialog (names the inquiry and supplier, explains that it stays as Cancelled with its history, cannot be undone, focus on "Keep inquiry", Escape cancels, locked while the request runs).
- **After confirming** (server answer only): success toast; the page refreshes from the server: status Cancelled, final "Inquiry Cancelled" step with its time, a new history entry (previous status, actor buyer), no cancel actions, next steps for a final inquiry. Nothing is deleted.
- **Quotations, messages, responses, orders:** none exist, so nothing needs preserving or blocking today. When they do: cancelling must keep them readable, must be refused (or follow an explicit policy) when a quotation is ACCEPTED or an order exists, and must notify the supplier through the real workflow.
- **Tested:** eligible cancel from the details page with dialog, Keep inquiry/Escape does nothing, confirm writes CANCELLED with history, toast, page state; a closed inquiry offers no cancel anywhere; cross-buyer, twice, closed/replied/quoted/rejected refused (Page 27 suite).
