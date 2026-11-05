# Pages 25-26 — Settings & Notifications: audit before implementation

Checked against the repository on 2026-11-03.

| Area | Finding |
|---|---|
| Notification storage / API / page | None. No `notifications` collection, route or page. Inquiries record `notification: { status: "BLOCKED", reason }` (supplier notification), which is a delivery state of an inquiry, not a buyer notification. |
| Dashboard | `getBuyerDashboardOverview` reports `notifications` as `{ available: false }`; the top bar had an inert "Notifications: not available yet" item. |
| Email | `src/lib/email/provider.ts` sends only when `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_API_URL` and `APP_URL` are configured; used by verification and password reset only. No notification email exists. |
| SMS / WhatsApp / push | None. |
| Settings storage | None. No preferences on `users`; `src/app/account/settings` does not exist (tracker ID 33 "Account Settings" is Not Started). |
| Password change | Exists: `POST /api/auth/change-password` (shared hashing and policy; other devices signed out). Reused. |
| Sessions | Stateless signed cookie with `{sub, v, exp}`; `users.sessionVersion` revokes every session at once. No session inventory, device or IP record exists, so a device list is impossible. |
| Two-step verification | None (no OTP or authenticator system). |
| Login alerts | Would need email or SMS delivery for notifications: unavailable. |
| Data export / deletion | No workflow. Contact Us (`/api/support/requests`) exists. |
| Currency / language / timezone | The site is English, INR, India time (Asia/Kolkata) everywhere; no alternatives exist in the codebase. |
| Marketing | No marketing sends and no consent record exist. |
| Real domain events available | Inquiry saved (registered buyer), company document uploaded or replaced, password changed, sign-out of all devices (new), email verified. |
| Real preference consumers | Only the new notification creation and the Buyer Dashboard period. |

## Decisions
1. **Two new collections, with reasons:** `buyer_settings` (one document per buyer; kept out of `users` because `users` holds credentials and is read on every request, and settings need their own versioned, independent saves) and `notifications` (many per buyer, TTL retention, read state, filters).
2. **Page merged:** one route, two tabs; no second page.
3. **Only real settings are switches.** Everything else is listed once as "Not available yet" with its reason: a switch that does nothing would be a fake setting.
4. **Only genuine events create notifications**, idempotently (`dedupeKey`), after the event succeeded; never from a schedule or guess. Email verified is **not** wired in this batch (the verify route is shared with suppliers and was not changed); it is listed as a gap.
5. **Required notices cannot be switched off:** the `account` category (password change, sign-out of all devices).
6. **Delivery honesty:** the only channel is the in-app list. No page text claims an email, SMS or WhatsApp message was or will be sent.

## Gaps and risks
- No retention obligations process, data export or deletion automation.
- Notifications created by an earlier development build of this feature (before the `isRead` field existed) would not appear in filtered lists; the collection is new, so this only affects development databases (delete them or set `isRead` from `readAt`).
- The inquiry notification says the supplier is not notified automatically, matching the Page 13/14 state; when supplier notification exists, a new event type should be added instead of changing this one.
