# Pages 25 and 26 — Buyer Settings & Notifications (`/buyer/settings`)

Owner PRD Pages 25 (Settings) and 26 (Notifications), built as **one page with two sections** (`?tab=settings`, `?tab=notifications`) inside the shared buyer shell, as the PRD asks ("no separate duplicate `/buyer/notifications` page"). The sidebar item **Settings & Notifications** is the current item on both sections; the top-bar bell links to the Notifications section.

Tracker: rows 25 and 26 are tracked as one merged row (ID 100, new; the baseline "Account Settings" `/account/settings` is superseded). Reference image: the Page 25/26 reference supplied by the owner.

## Settings section
1. **Security** (reused `SecurityPanel`, the same component as Profile > Security): account, email and mobile status, last sign-in, password last changed, **Change Password** through the one shared route `POST /api/auth/change-password`.
2. **Signed-in devices:** one real control, "Sign out of all other devices" (raises the session version; this device stays signed in). No device list: cookies are stateless.
3. **More security options:** Two-step verification and Login alerts, shown as "Not available yet" with the reason; no switch.
4. **Notification preferences (real):** Inquiry updates, Company and documents (switchable); Account and security (required: "Always on", disabled). Applied where a notice is created, on the server.
5. **Display and regional:** the dashboard period (real: the Buyer Dashboard opens with it when the address names no range); language (English), timezone (India time) and currency (INR) are shown as fixed values, not choices.
6. **Privacy and data:** data export and account deletion are handled by support (no automation); links to Contact Us, Privacy Policy, Terms (those two pages are not published yet and show the site's honest placeholder).
7. **Not available yet:** email/SMS/WhatsApp notifications, promotional offers and recommendations (no marketing consent exists, nothing is on by default), profile visibility, date/number format, business preferences, integrations.

One Save Preferences button for sections 4 and 5; unsaved changes are confirmed before leaving the tab; Save is disabled until something changes; "saved" is shown only after the server answered.

## Notifications section
Heading, mark-all button, status filter (All, Unread (n), Read), type filter (All, Inquiry updates, Company and documents, Account and security), a list of notices (title, body, category, India-time date, a text "New" tag for unread, "Open" only for safe internal links, "Mark as read"), 20 per page with Previous/Next and "Showing a-b of n", filters and page in the address (`?category=&status=&page=`), empty, no-match and error states with Try again. Notifications are kept 180 days.

## Top bar bell
A link with the real unread count ("99+" beyond 99), an accessible label ("Notifications, 3 unread"), refreshed on load, on window focus, after the centre changes something and every minute while the tab is visible. If the count cannot be read it shows no number.

## Responsive and accessibility
Status and type chips scroll inside their own row; cards stack; switches are real checkboxes with text state ("On/Off/Always on"); 44px targets; unread is a text tag, not colour only; `aria-pressed` filters; `aria-live` regions for results and errors.

Report: `docs/page-reports/25-26-buyer-settings-notifications-report.md`.
