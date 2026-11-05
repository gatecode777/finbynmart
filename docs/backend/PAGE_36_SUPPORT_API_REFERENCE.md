# Page 36 — Support API reference

All buyer routes: session required (401 none, 403 supplier, suspended = 401), `Cache-Control: private, no-store`. Responses `{ ok, message, fields? }`. Methods other than those listed answer 405.

| Route | Purpose |
|---|---|
| `GET /api/buyer/support/summary` | `{ total, open, inProgress, resolved }` over all of the buyer's tickets (one grouped read) |
| `GET /api/buyer/support/categories` | the one configuration: categories, related types, statuses, limits (attachments, subject, description) |
| `GET /api/buyer/support/related?type=inquiry\|quotation\|order\|product` | up to 20 of the buyer's own records for the picker; unknown type 400 |
| `GET /api/buyer/support/tickets` | list. Query: `q` (≤60), `status` (all, open, assigned, in_progress, waiting_for_buyer, waiting_for_support, resolved, closed, reopened), `categoryId`, `relatedEntityType`, `range` (7d, 30d, custom) + `dateFrom`/`dateTo`, `sort` (newest, oldest, updated), `page` (≤1000), `limit` (default 20, max 50). Invalid values 400. Unknown parameters ignored |
| `POST /api/buyer/support/tickets` | create. `multipart/form-data` (`payload` JSON + `files`) or JSON. Rate limit 10 per buyer per hour (429 + Retry-After). 201 created, 200 duplicate (same `idempotencyKey`), 400 validation (`fields`), 413 oversize. Body fields: `category`, `subject`, `description`, `related?`, `idempotencyKey`. Any other field (status, priority, agent, buyerId, reference, events, dates, notes) is refused 400 |
| `GET /api/buyer/support/tickets/[ticketReference]` | detail with attachments (download links) and history. Foreign, unknown and malformed references give the same 404 |
| `GET /api/buyer/support/tickets/[ticketReference]/attachments/[attachmentId]` | owner-only download: `attachment` disposition, `no-store`, `nosniff`, display name only. Others 404 |

Creation response includes `supportNotified: false` and the message "No support team replies through this site yet" until a support side exists.

## Public routes (anonymous, cacheable, no account data)
| Route | Purpose |
|---|---|
| `GET /api/public/faqs?category=&q=` | published FAQs (`id, category, question, answer`); unknown category or q > 60 chars → 400 |
| `GET /api/public/faqs/categories` | categories that have at least one published FAQ, with counts |
| `GET /api/public/support/channels` | ticket, Contact Us, chat (`available:false`), plus e-mail/phone/hours only when configured |

## Not built (no backing system)
Replies, reopen, close, assign, status change, attachment add after creation, admin FAQ management: BLOCKED until a support side exists.
