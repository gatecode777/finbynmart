# Page 36 — Support ticket data model

Collection `support_tickets` (MongoDB). Code: `src/lib/support/ticketService.ts` (`TicketDoc`), rules in `ticketRules.ts`.

| Field | Notes |
|---|---|
| `ticketReference` | `FBM-SUP-YYYYMM-XXXXXX` (month in India time; six characters of the unambiguous alphabet). Unique index. Collision retry on insert |
| `buyerId` | ObjectId from the session, never from the client |
| `categoryId` | one of 11 slugs (see SUPPORT_CATEGORY_RULES) |
| `subject`, `description` | trimmed; 5–150 and 10–1,000 characters; `<` and `>` refused |
| `related` | optional `{ type, reference, label, href }`, resolved and ownership-checked on the server. The label and link are saved at creation |
| `status` | one of 8 statuses; always `OPEN` at creation, never set by the client |
| `priority` | server-set `NORMAL`; the client cannot send it |
| `assignedAgentId` | `null` until a support side exists |
| `attachments[]` | `{ id (16 hex), name (display only), mime, size, ref (random private file name) }`. `ref` is never returned by any API |
| `events[]` | `{ type: CREATED \| STATUS_CHANGED, at, actor: buyer \| support \| system, from?, status }`. Append-only |
| `idempotencyKey` | 16–64 characters from the form; unique per buyer |
| `notification.supportEmail` | `not_configured`, `sent` or `failed` — what actually happened to the optional support-inbox alert |
| `createdAt`, `updatedAt` | dates |

## Indexes
| Name | Keys | Used by |
|---|---|---|
| `ticket_reference` | `ticketReference` (unique) | detail, uniqueness |
| `buyer_tickets_newest` | `buyerId, createdAt -1, _id -1` | default list, date windows, category/module filters, summary |
| `buyer_tickets_status_newest` | `buyerId, status, createdAt -1, _id -1` | status filter, newest/oldest |
| `buyer_tickets_status` | `buyerId, status, updatedAt -1, _id -1` | status filter, recently updated |
| `buyer_tickets_updated` | `buyerId, updatedAt -1, _id -1` | recently updated sort |
| `buyer_tickets_category` | `buyerId, categoryId, createdAt -1, _id -1` | category filter |
| `buyer_ticket_submission` | `buyerId, idempotencyKey` (unique) | duplicate-submission prevention |

Explain (1,000 tickets, test database): newest, status, status+updated, updated and category lists all use an index scan, no blocking sort, 20 documents examined for a 20-row page.
