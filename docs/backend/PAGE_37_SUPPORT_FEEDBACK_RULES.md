# Page 37 — Feedback rules

Collection `support_feedback`: `ticketId`, `ticketReference`, `buyerId`, `rating` (integer 1–5), `feedbackText` (≤ 1,000, may be empty), `createdAt`. **Unique index on `ticketId`**: one feedback per ticket, ever (including after a reopening), enforced by the database, so a double click or race stores one.

- **Eligible**: the ticket is the buyer's, status RESOLVED or CLOSED, and no feedback exists. Otherwise 409 ("Feedback can be sent once the ticket is resolved or closed." / "You already sent feedback for this ticket.").
- **Input**: `rating` must be a JSON number that is a whole number 1–5 (text "5", 2.5, 0, 6, null, missing are 400); `feedbackText` optional, trimmed, ≤ 1,000, no `<` `>`. Buyer, ticket, date or any other field in the body is refused 400: the buyer and ticket come from the session and the address.
- **Result**: the record is inserted, then a FEEDBACK_SUBMITTED event (no rating or text) is added to the ticket; the page shows "You rated this ticket N out of 5" only after the server answered 201. A 409 "already sent" from a second tab is treated as done.
- **Privacy**: feedback is private to the buyer and Finbyn Mart; no API exposes it to anyone else and it is not shown publicly. There is no support-side view yet (BLOCKED); nothing aggregates ratings.
- **Cannot be changed by the buyer** after sending (no edit route).
- Rate limit 10 per buyer per hour.
