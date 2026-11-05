# Page 26 — Notification data model (`notifications`)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Notification id used by the read endpoint; always looked up together with `buyerId` |
| `buyerId` | ObjectId | Recipient; from the session or the server-side event, never from a request |
| `category` | `inquiries` `company` `account` | `account` is required (cannot be switched off) |
| `type` | string | `INQUIRY_SUBMITTED`, `DOCUMENT_UPLOADED`, `DOCUMENT_REPLACED`, `PASSWORD_CHANGED`, `SIGNED_OUT_EVERYWHERE` |
| `title` (≤120), `body` (≤400) | string | Plain text, written by the server from the event; rendered as text |
| `link` | string or null | Only a safe internal path (`/buyer/...` or `/account/...`); checked when created and again when returned |
| `dedupeKey` | string | One per real event for this buyer (`inquiry:<reference>`, `document:<id>`, `password:<sessionVersion>`, `signout:<sessionVersion>`) |
| `isRead` | boolean | The read state every filter uses (an equality an index can sort after) |
| `readAt` | Date or null | When it was read; always set together with `isRead` |
| `createdAt` | Date | Server time |
| `purgeAt` | Date | `createdAt` + 180 days; TTL index deletes it |

The API returns an allow-listed DTO: `id, category, type, title, body, link, read, readAt, createdAt` (no buyer id).

## Indexes (all verified with `explain`, see the performance report)
| Name | Key | Serves |
|---|---|---|
| `nf_buyer_newest` | `{buyerId, createdAt:-1, _id:-1}` | the unfiltered list |
| `nf_buyer_status_newest` | `{buyerId, isRead, createdAt:-1, _id:-1}` | unread / read lists, the unread count, mark-all |
| `nf_buyer_category_newest` | `{buyerId, category, createdAt:-1, _id:-1}` | a category list |
| `nf_buyer_category_status_newest` | `{buyerId, category, isRead, createdAt:-1, _id:-1}` | category + status, category-scoped mark-all |
| `one_notification_per_event` | unique `{buyerId, dedupeKey}` | idempotent creation |
| `retention_ttl` | `{purgeAt}` TTL 0 | 180-day retention |

Why four list indexes: every list is "this buyer, optionally a category, optionally read or unread, newest first, ties by id". Each combination needs equality fields first and the sort fields last; with fewer indexes MongoDB sorts in memory (an earlier version did, examining all 20,000 of a buyer's rows for a 20-row page). The write cost is paid on creation and on read-state changes only.

Earlier index names (`buyer_newest`, `buyer_unread_newest`, `buyer_category_newest`) are dropped on first use if they exist.
