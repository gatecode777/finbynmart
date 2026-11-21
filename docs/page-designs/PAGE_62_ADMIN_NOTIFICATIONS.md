# Page 62 — Admin Notifications

Route: `/admin/notifications` · Portal: ADMIN · Tracker ID 62. Header bell in `AdminShell`. In-app only: no e-mail, SMS, push, broadcast or scheduler.

## Files
`src/lib/admin/notificationRules.ts` (client-safe), `notifications.ts` (service), `src/app/api/admin/notifications/route.ts`, `[id]/read/route.ts`, `read-all/route.ts`, `src/app/admin/notifications/page.tsx`, `src/components/admin/AdminNotificationsWorkspace.tsx`, `AdminBell.tsx`, `AdminNotifications.module.css`. Producers edited: `src/lib/verification/service.ts`, `src/lib/supplier/productDraftService.ts`, `src/lib/support/ticketService.ts`. Also `permissions.ts` (`notifications.read`) and `AdminShell.tsx`. Tests: `86-admin-notifications-unit-test.mjs` (17), `it-admin-notifications.mjs` (integration, BLOCKED).

## Event-to-capability matrix
| Event type | Real workflow event | Required capability (held now) | Destination | Stored |
|---|---|---|---|---|
| `VERIFICATION_SUBMITTED` | supplier verification submission committed (`submitVerification`) | `verification.read` | `/admin/verification?review=<submission reference>` | reference |
| `PRODUCT_REVISION_SUBMITTED` | product revision moved to PENDING review (`submitForReview`) | `products.review` | `/admin/product-review` | product id |
| `SUPPORT_TICKET_CREATED` | buyer ticket created (`createTicket`) | `support.manage` | `/admin/support` | ticket reference |
Access to the page needs `notifications.read`; it grants no event. The admin model has no narrower record scope, so the audience is "holds the capability now". Titles and generic descriptions are fixed templates ("Product revision submitted" / "A submitted product revision is ready for review."): no subject, message, document, contact or moderation text is ever stored or returned. Destinations are built from the trusted type and the stored reference; each destination enforces its own permission.

## Producer integration and deduplication (no worker)
`recordAdminEvent(session, { type, sourceKey, reference })` is an idempotent upsert on the unique `sourceKey`, called inside the producer's own transaction: the verification submit transaction (key `verification:<reference>:SUBMITTED`), a new transaction around the product's conditional PENDING update (key `product:<id>:<draft revision>:<submittedAt ms>`, so a resubmission after withdrawal is a new event, a retry of the same one is not, and a lost race records nothing) and a new transaction around the ticket insert (key `support:<ticket reference>`; a duplicate-key retry aborts both). An event therefore exists exactly when the business write committed; no GET creates one; private drafts and incomplete uploads never alert. No outbox, worker or scheduler is needed or used. Note the product and ticket producers now require a transaction-capable database (they already ran against Atlas/replica set elsewhere); this is untested here.

## Per-admin read state
Events are shared, read state is personal: `admin_notification_reads` holds one receipt per (admin, event) (unique index, server time, idempotent `$setOnInsert`); `admin_notification_state` holds one per-admin mark-all cutoff `readKey`. Unread for an admin = capability held now AND event key above that admin's cutoff AND no receipt. One admin's action never changes another's. The unread count uses exactly these rules, never a tab or type filter, and is the number the bell shows (capped visually at 99+ with an honest accessible name).

## Mark all
"Mark all currently authorized notifications as read": the server sets this admin's cutoff to the key (recorded time, id) of the newest authorized event that exists at that moment, with `$max` (moves forward only; a repeat is a no-op), regardless of tab or type, across all pages, without a client loop. Events recorded afterwards stay unread. A concurrent insert in the same millisecond with a smaller id than the cutoff event would count as read (accepted, documented).

## Permission changes
Permissions are re-read on every request. Revocation removes the events from the list and count at once (receipts and cutoff are kept but never exposed; marking such an event is the same 404). A newly granted capability makes the EXISTING events of that type visible and unread unless at or below the cutoff (no per-admin copy and no silent backfill exists); nothing else is granted.

## API
`GET /api/admin/notifications?tab=all|unread&type=&cursor=&limit=` (20 per page, max 50; opaque cursor on the recorded time and id; unknown parameters including any admin id are 422); `GET ...?count=1` (header bell total); `PATCH /api/admin/notifications/[id]/read` (no body); `POST /api/admin/notifications/read-all` (no body). All need `notifications.read`, derive the admin from the session, are rate limited and `private, no-store`; writes refuse cross-site requests first; unknown, malformed and unauthorized ids are one 404; responses carry the authoritative unread count. No endpoint creates a notification.

## UI
Tabs All / Unread (n); event-type filter limited to the types the admin may see; Refresh (replaces the page, no duplicates); Mark all as read; Previous / Next on cursors; items with icon, fixed title, generic description, relative time (absolute IST in the tooltip), an Unread label and hidden screen-reader text (not colour only), a link and Mark as read with descriptive names. Nothing is optimistic; failure keeps the item unread and the count unchanged; stale responses are ignored; states: loading, populated, no notifications yet, no unread, no matching type, failure with Retry, no supported permissions. The page states that reading does not complete the task and that a notification is an event record, not live status. The design board's sample rows and the empty-state inset are not rendered.

## Verified
Passed: `tsc`; lint; production build; 17 unit checks (matrix, audience, destinations, query validation, cursor, producers inside transactions, reads never write, personal receipts, cutoff, route contracts); signed-out `GET`, `GET ?count=1`, `PATCH` and `POST` = 401 JSON `private, no-store`; cross-site `POST` = 403; the page redirects to sign-in. Mocked-API browser checks on a temporary fixture page (removed): 31 checks (populated, tabs, tab and type requests, unread cues, bell total and 99+ cap, hidden bell on refusal, mark one with server count and failure keeping state, mark all one POST and reload and failure, paging, refresh, all empty and failure states, stale response ignored, no write on load, 8 widths, landscape, 200 %-zoom width, keyboard focus). Screenshots `an-1280.png`, `an-390.png` in the session scratch folder (not individually reviewed).

## Blocked / not verified
`it-admin-notifications.mjs` (duplicate key and rollback, deterministic pagination with ties, personal read state, idempotent marks, mark-all cutoff incl. older pages and later events, count equals list, revocation, index use) is written and **not run**: no isolated transaction-capable database. Not run: end-to-end producers against real data, signed-in admin browser checks, HTTP 403 by role and capability, Firefox, Safari, devices, screen reader, contrast tool. The changed producers' existing tests (verification, product moderation, support) are static and passed; their runtime suites remain BLOCKED.

## Gaps
No notification retention policy exists or was added. No per-admin muting (Page 64 documents the preference decision). Other future events (quotations, inquiry failures) are not added until their workflows have a reliable event.
