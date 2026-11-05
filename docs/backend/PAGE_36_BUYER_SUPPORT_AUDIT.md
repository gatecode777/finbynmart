# Page 36 — Audit of existing support infrastructure (before building)

Date: 2026-11-05. Evidence from the repository, not assumptions.

| Capability | Found | Decision |
|---|---|---|
| Support ticket collection or API | None. `/api/buyer/support/*` did not exist | Built: `support_tickets` collection, buyer-scoped routes |
| Contact Us submissions | `src/lib/support/rules.ts` + the Contact Us form store messages with references `FBM-SUP-XXXXXXXX` (8 characters, no month) | Kept unchanged. Ticket references have a different shape (`FBM-SUP-YYYYMM-XXXXXX`) so the two cannot be confused. Contact Us stays the "message without a ticket" channel |
| Support staff / agent accounts, roles, admin panel | None. Roles are not enforced beyond buyer/supplier | Staff side BLOCKED. `assignedAgentId` stays null; no status can be changed from the site |
| Ticket replies / conversation | None | BLOCKED (Page 37). The ticket page shows an honest note |
| E-mail provider | Optional, env-driven | Support-inbox alert is sent only if `SUPPORT_EMAIL` and the provider are configured; neither is, so the ticket answer says `supportNotified:false` |
| Notifications | Buyer in-app notifications exist (`notifications` collection) | Added category `support` and type `TICKET_CREATED`; always on |
| File storage | Private buyer-document store (`BUYER_DOCS_DIR`) with content checks, used for company documents | Reused for ticket attachments. ImageKit is not present: BLOCKED as a storage option |
| FAQ source | None | Repo-managed content with `published` flags. No admin source exists |
| Support contact details | None configured | Channels come from env only |
| Related records | `inquiries`, `quotations`, `orders` (buyer-owned); catalogue products; saved products | Related types: inquiry, quotation (non-draft, current), order, product. Invoice and payment BLOCKED (no such records exist) |
| Live chat | None | Always shown as not available |

Existing items reused: `requireBuyerPage/Api`, `buyerGuard`, `rateLimit`, `readSmallJson`, `withApiPerf`, `BuyerShell`, inquiries list classes, `Modal`, `flashToast`, India-time date windows.
