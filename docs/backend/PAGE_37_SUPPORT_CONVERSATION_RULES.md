# Page 37 — Conversation rules

Collection `support_messages`: `ticketId`, `ticketReference`, `buyerId`, `senderRole` (buyer | support | system), `kind` (reply | reopen), `visibility` (buyer | internal), `body`, `attachments[]`, `hasFiles` (only when there are files), `idempotencyKey` (buyer sends), `supportEmail` (what happened to the optional inbox alert), `createdAt`. Files are never stored in the document, only their private storage reference.

- **Visible** = `visibility: "buyer"` on the buyer's own ticket. Internal notes (`visibility: "internal"`) are excluded by every query (conversation, timeline, files, download).
- **Order**: time, then id. A page is read newest-first and shown oldest-first; the cursor (`before`) is the ordering key of the oldest message shown, so nothing repeats or is skipped, including messages written in the same millisecond (tested with 30).
- **First message**: the ticket's own description and files are shown as the first message ("Original ticket description") when there is nothing older. It is read from the ticket, not copied.
- **Paging**: 20 by default, 50 at most; never the whole history.
- **Kinds**: a `reopen` message holds the reason given when reopening; it is shown in the conversation with a "Reason for reopening" label and is not listed again in the timeline.
- **Support messages** (`senderRole: "support"`) are displayed as "Finbyn Mart Support"; no agent name or contact is ever exposed. No code writes them yet: they are inserted directly in tests to prove the buyer side reads them correctly and hides internal ones.
- **Text only**: bodies are rendered by React as text; line breaks are kept with CSS; HTML in a body is shown literally (tested). No editing, no deleting by the buyer (history is permanent).
- **Read receipts**: none are recorded, so none are shown.
- **Refresh**: manual, and when a page that was in the background becomes visible after a minute; the newest 50 are merged in without repeats; if more than 50 arrived the list restarts from the newest.
