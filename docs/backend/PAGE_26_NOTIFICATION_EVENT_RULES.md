# Page 26 — Notification event rules

A notification exists only because something real happened in this application. All events are defined in one place (`src/lib/buyer/notifications.ts`, the `notify...` functions) so wording and dedupe keys are reviewable.

| Event | Trigger (after it succeeded) | Category | Dedupe key | Link |
|---|---|---|---|---|
| Inquiry saved | `submitInquiry` inserted an inquiry for a **registered buyer** (guests get none) | inquiries | `inquiry:<reference>` | `/account/inquiries` |
| Document uploaded / replaced | `uploadBuyerDocument` stored the file and the row | company | `document:<documentId>` | `/buyer/profile?tab=documents` |
| Password changed | `POST /api/auth/change-password` changed the hash (buyer accounts) | account (required) | `password:<sessionVersion>` | `/buyer/settings?tab=settings` |
| Signed out of all devices | `POST /api/buyer/settings/sign-out-everywhere` bumped the session version | account (required) | `signout:<sessionVersion>` | `/buyer/settings?tab=settings` |

## Rules
1. **Idempotent:** `dedupeKey` is unique per buyer, so a retry, a replay or a duplicate event cannot create a second notice. Replaying an inquiry with the same idempotency key creates none (tested).
2. **Never blocks the action:** `notifyBuyer` catches every error (it logs only the event type, never text) and the originating action still succeeds.
3. **Preferences are applied here:** a switched-off optional category creates nothing; the required `account` category always does.
4. **Honest wording:** the inquiry notice says the supplier is *not notified automatically yet* (the Page 13/14 truth); the document notice says the status is Pending and not verified (no review process exists).
5. **No personal data:** text contains the inquiry reference, supplier name and document type only; never email, phone, passwords or tokens.
6. **Safe links:** only `/buyer/...` or `/account/...` paths; checked on creation and on read.
7. **Retention:** 180 days, then the TTL index removes it.

## Events deliberately not generated (no real event exists)
Supplier replied, quotation received or revised, message received, order status, price alerts, promotions, product recommendations, KYC review results (no admin review process), mobile verified (no SMS), **email verified** (the verify route is shared with suppliers; not wired in this batch: a listed gap), inquiry status changes by a supplier (no supplier workflow exists).

## Adding an event
Add a `notify...` function with its category, a dedupe key that is unique per real event, honest text and a safe link; call it after the action succeeded. Do not call it from the browser, a schedule or a demo path.
