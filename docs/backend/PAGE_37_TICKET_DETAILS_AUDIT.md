# Page 37 — Audit before building (2026-11-05)

| Area | Found in the repository | Decision |
|---|---|---|
| Tickets | `support_tickets` (Page 36): reference, buyer, category, subject, description, 8 statuses, embedded `attachments[]` and small `events[]` (CREATED, STATUS_CHANGED), `resolvedAt`/`closedAt` fields (never written), 7 indexes | Reused. Added event types REOPENED and FEEDBACK_SUBMITTED, an `internal` flag on events, and `lastSupportReplyAt` |
| Messages / replies | **None.** No collection, no API. The old ticket page showed the description only | New `support_messages` collection: a conversation grows without bound, a ticket document must not (16 MB, paging) |
| Sender roles / internal notes | No support side, no roles beyond buyer/supplier | `senderRole` buyer \| support \| system and `visibility` buyer \| internal exist in the schema; every buyer query filters `visibility: "buyer"`; only a buyer reply can be written today |
| Attachments | Page 36 private store, content checks, owner download for the ticket's own files | Reused for replies; download route extended to reply files; a small partial index for files |
| Events / timeline | Embedded lifecycle events only; reply events did not exist | Timeline merges ticket events with buyer-visible messages; no second event collection |
| Reopening | No policy anywhere | Defined here: resolved or closed tickets, within 30 days of the recorded resolution, at most 3 times, reason required |
| Feedback / ratings | Supplier reviews exist (different thing); no ticket feedback | New `support_feedback`, one per ticket (unique index) |
| Related records | Page 36 resolved them at creation and stored label and link | Re-read live on every view, ownership re-checked; invoice and payment do not exist |
| Notifications | Buyer in-app notifications; `TICKET_CREATED` only | No support-to-buyer events can happen yet (no support side), so none are generated; nothing pretends otherwise |
| Real-time | None | Manual Refresh and a refresh when the tab becomes visible; no sockets, no timer polling |
| Support-inbox e-mail | Optional, env-driven, nothing configured | Same optional alert for replies and reopening, without message text; untested |

## Missing / BLOCKED (no backing system)
Support agents and any way to answer a ticket; support-written messages, assignments, resolutions (the schema and the buyer's reading of them are built and tested with records inserted directly); notifications for agent replies and status changes; read receipts; real-time delivery; buyer-requested closure (no policy); preview of files; invoice and payment related records.

## Security and performance gaps found
No per-ticket message cap (the 30 per hour per buyer limit is the only brake); no malware scan (as Page 36); the files tab lists by message, so a ticket with thousands of file-bearing messages needs many pages (bounded, indexed).
