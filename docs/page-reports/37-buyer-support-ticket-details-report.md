# Page 37 — Buyer Support Ticket Details: implementation report

Date: 2026-11-05. Route `/buyer/support/tickets/[ticketReference]` (tracker ID 106). Modifies the compact ticket page from Page 36 in place; the old `SupportTicketDetailView` was replaced by the tabbed page.

## What exists now
- **Backend:** new collections `support_messages` (3 indexes, partial indexes for files, send key and file id) and `support_feedback` (unique per ticket); `src/lib/support/` gained `conversationRules.ts` (client-safe rules, cursors, validation), `conversationService.ts` (overview, messages, reply, timeline, files, download), `ticketActions.ts` (reopen, feedback), `relatedDetails.ts`, `uploadRequest.ts` (one multipart reader shared with ticket creation). Eight buyer routes under `/api/buyer/support/tickets/[ref]/`.
- **UI:** summary strip, four accessible tabs with URL state, conversation with older-message paging, reply composer (draft kept across tabs, upload progress), timeline, files by source, related record, ticket information, Reopen dialog, feedback card, Back to All Tickets that keeps the list's filters, refresh on demand and on return to the tab.
- **Capabilities** (reply, reopen, feedback) are computed by the server from the status and policy; the browser only displays them.

## Honest limits (BLOCKED, not simulated)
There is **no support side**: no agents, no way to answer a ticket, assign it or resolve it, so no support reply or status change can happen through the product. The buyer's reading of such records is built and tested with records inserted directly. Consequently: notifications for agent replies and status changes are not generated (nothing triggers them); the reply/reopen alert to a support inbox is sent only if `SUPPORT_EMAIL` and an e-mail provider are configured (neither is; untested); read receipts and real-time delivery do not exist (manual refresh instead); buyer-requested closure has no policy (`canRequestClosure` is false); no file preview; invoice and payment related records do not exist; priority and agent identity are not shown; no malware scan.
Policies defined here because none existed: reopen within 30 days of the recorded resolution, at most 3 times, reason required; reply allowed on every non-resolved, non-closed status; one feedback per ticket.

## Tests
Unit 25/25; integration 92/92 (browser flows, 16 widths, 1,000- and 10,000-message performance, explain plans); the Page 36 suite (updated) 75/75 and its unit test 29/29. Details, defects found and the not-run list: `docs/backend/PAGE_37_TEST_REPORT.md`. Performance (all targets met in the final run; earlier single-request misses listed): `PAGE_37_PERFORMANCE_REPORT.md`. Screenshots: `docs/page-reports/screenshots/37-ticket-details-{390,768,1440}.png` (390 and 1440 viewed).

## Files
Created: `src/lib/support/{conversationRules,conversationService,ticketActions,relatedDetails,uploadRequest}.ts`; `src/app/api/buyer/support/tickets/[ticketReference]/{messages,timeline,related,reopen,feedback,attachments}/route.ts`; `src/components/buyer/support/{BuyerSupportTicketDetails,SupportConversation,SupportMessageBubble,SupportReplyComposer,SupportTicketTimeline,SupportAttachmentList,SupportRelatedDetails,ReopenTicketModal,SupportFeedbackForm}.tsx`, `usePagedFetch.ts`, `TicketDetails.module.css`; tests `docs/page-reports/tools/37-*.mjs`; docs `docs/page-designs/37-*.md`, `docs/backend/PAGE_37_*.md`.
Modified: `ticketService.ts` (event types, `lastSupportReplyAt`, details and download moved out), `ticketRules.ts` (`cleanMultiline` exported), the ticket routes (detail, download, create now use the shared reader), the ticket page, `BuyerSupportPage.tsx` (remembers the list's query for Back), the Page 36 test, `CLAUDE.md`, `docs/backend/{DATABASE_SCHEMA,API_REFERENCE}.md`, `docs/PAGE_TRACKER.md`.

## Status
Design Complete (spec + reference). Development Implemented; QA In Progress (Chrome only, no accessibility tooling run); not "Functionally Verified" end to end because the support side that completes the conversation does not exist.
