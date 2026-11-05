# Page 37 — Reply rules

`createBuyerReply` in `conversationService.ts`; validation `validateReply` in `conversationRules.ts`.

**Input**: `message` 2–2,000 characters after trimming (line breaks kept, control characters removed, no `<` or `>`), `idempotencyKey` 16–64 characters from the form, up to 5 PDF/JPG/PNG files of 10 MB (Page 36 limits and configuration). Anything else in the body is refused.
**Sender**: the signed-in buyer, from the session; role `buyer`; visibility `buyer`. A sender, role, visibility, status, ticket or owner field in the request is refused 400.
**When**: statuses OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_BUYER, WAITING_FOR_SUPPORT and REOPENED. A RESOLVED or CLOSED ticket answers 409 with "Reopen it to reply."

**Order of work**
1. The ticket must be this buyer's (else 404).
2. A retried send (same key) returns the first message (200, `duplicate:true`), even if the status has changed since.
3. The status must allow a reply.
4. Files are checked by content (magic bytes), extension must match; stored privately under random names.
5. The message is inserted (unique `ticketId + idempotencyKey`; four simultaneous sends save one).
6. The ticket's last update moves forward (`$max updatedAt`); a ticket **waiting for the buyer** moves to **In Progress** with a STATUS_CHANGED event by the buyer (an allowed transition, applied only if the status is still what was read). Other statuses are left alone.
7. Only then is success reported; the answer is the saved message. If the insert fails the files are removed.
8. If `SUPPORT_EMAIL` and an e-mail provider are configured, a short alert without the message text is sent in the background and its real result recorded on the message; otherwise `supportEmail: "not_configured"`. The answer always says `supportNotified:false`: nothing here tells the buyer that anyone was alerted.

**Limits**: 30 replies per buyer per hour (429 with Retry-After). No per-ticket cap (documented gap).
