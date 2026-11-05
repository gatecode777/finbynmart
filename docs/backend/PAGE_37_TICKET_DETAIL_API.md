# Page 37 — Ticket detail API

All routes: buyer session (401 none, 403 supplier, suspended = 401), `Cache-Control: private, no-store`, ticket found by (reference AND session buyer): another buyer's, an unknown and a malformed reference give the same 404 `{"ok":false,"message":"That ticket was not found."}`. Wrong methods answer 405. Code: `src/lib/support/{conversationService,ticketActions,relatedDetails,conversationRules,uploadRequest}.ts`.

| Route | Purpose |
|---|---|
| `GET /api/buyer/support/tickets/[ref]` | the ticket: reference, subject, category, status and label, dates, related (as stored), `resolvedLabel`, `hasSupportReply`, **`capabilities`** `{canReply, canReopen, canSubmitFeedback, canRequestClosure:false}`, **`reasons`** (why not), `feedback {submitted, rating, submittedLabel}`, `limits {maxFiles, maxMb, types, canAttach}`, `reopenCount` |
| `GET .../messages?limit=&before=` | buyer-visible messages, newest page first (oldest first inside the page); `before` = the `nextCursor` of the previous answer; the original description is added with the oldest page. `meta {hasMore, nextCursor}` |
| `POST .../messages` | a buyer reply: `multipart/form-data` (`payload` JSON `{message, idempotencyKey}` + `files`) or JSON. 201 saved, 200 duplicate send, 400 validation (`fields`), 409 not allowed on this status, 413 oversize, 503 storage. 30 per buyer per hour (429 + Retry-After). Answer: `data {message, status, statusChanged}`, `supportNotified:false` |
| `GET .../timeline?limit=&after=` | recorded activity oldest first; events and messages merged; `meta` |
| `GET .../attachments?limit=&after=` | files with `source` (ticket/reply), `uploadedBy`, date, size, type and an owner-checked `href`; `limit` counts file-bearing messages; the original submission's files come with the first page |
| `GET .../attachments/[attachmentId]` | owner-only download (Page 36 route, now also for reply files); internal messages' files 404 |
| `GET .../related` | the linked record read again now: `{related: null}` when none, `{available:false,...}` when it is gone or no longer the buyer's, else title, lines, status, link |
| `POST .../reopen` | `{reason}` (10–1,000). 200 reopened, 400 validation, 404, 409 not eligible (status, 30-day window, 3 reopenings) or just reopened. 5 per buyer per hour |
| `POST .../feedback` | `{rating (1–5 number), feedbackText?}`. 201 saved, 400, 404, 409 not resolved/closed or already sent. 10 per buyer per hour |

Paging: default 20, maximum 50; a bad `limit` or cursor is 400; an operator-style key (`before[$gt]`) is an unknown parameter and is ignored. The cursor is an ordering key `<ms zero-padded>:<e|m>:<hex id>` validated by pattern.
Fields a client may never send (refused 400): sender id/role/name, role, buyer, user, ticket, reference, status, visibility, kind, dates, attachments, events, internal, agent.
Never returned: internal notes, internal messages, internal events, buyer id, ticket id, storage references, e-mail status, idempotency keys.
