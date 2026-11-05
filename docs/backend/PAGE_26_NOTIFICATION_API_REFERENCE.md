# Page 26 — Notification API reference

All routes: buyer session required (401 without, 403 for a supplier), private `no-store`, shape `{ ok, message, fields?, data? }`. The buyer is always taken from the session; a `buyerId` or `userId` parameter is never read.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/buyer/notifications?category=&status=&page=&limit=` | `data: { notifications, unread, meta{total,page,limit,totalPages} }`. `category`: all, inquiries, company, account. `status`: all, unread, read. `page` 1–1000, `limit` 1–50 (default 20). Newest first, ties by id |
| GET | `/api/buyer/notifications/unread-count` | `data: { unread, capped }`; counted up to 100 (the badge shows 99+) |
| PATCH | `/api/buyer/notifications/[id]/read` | No body. Marks one as read; idempotent (keeps the first read time). Another buyer's id, an unknown id and a malformed id all answer the same 404. 120 writes per 10 minutes |
| PATCH | `/api/buyer/notifications/read-all[?category=]` | No body. Marks up to **200** unread (of one category or all), newest first, and returns `{ changed, more, unread }`. While `more` is true the caller repeats; the page does this automatically (up to 150 requests). Its own limit: 300 per 10 minutes |

## Errors
400 for an unknown category or status, `page` outside 1–1000, `limit` outside 1–50, a JSON-looking value; a bracket-style operator parameter such as `category[$ne]=x` is not the `category` parameter and is ignored · 401 · 403 · 404 · 429.

## Notes
- A page beyond the last returns an empty list with the true total (not an error); the page then steps back to the last real page.
- Read state is filtered on `isRead`; `readAt` is the time only.
- Unread state shown in the UI always comes from these answers; nothing is marked read until the server said so.
- No create endpoint exists: notifications are created only by server-side events (see the event rules).
