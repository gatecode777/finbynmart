# Page 38 — Buyer Account Activity & Security

Route: `/buyer/security?tab=overview|password|2fa|sessions|activity|alerts` (buyer accounts only, noindex, never cached). Part of "Settings & Notifications": that sidebar item stays highlighted, the breadcrumb is Home / Buyer Dashboard / Settings & Notifications / Security, and the Settings page links here (its security card shows the real device count and an "Open Account Security" link). No second navigation entry, header or sidebar.
Design system: `DESIGN.md` only; the buyer shell, dashboard KPI cards, inquiry-detail tabs, `ConfirmDialog`, `Toast` and the shared `PasswordField` are reused; new styles are in `Security.module.css`.

## Layout
- Header: **Change Password** (opens the Password tab) and **Sign Out Other Devices** (opens the confirmation on the Sessions tab). Both work; neither is shown if unsupported.
- Four cards from the server: **Account Security** (Protected / Action Required / Incomplete / Unavailable, with the reason), **Two-Step Verification** ("Not available"), **Active Sessions** (the registry count), **Recent Security Alerts** (unseen, last 30 days).
- Six accessible tabs (arrow keys, Home/End; the address carries `?tab=`; unknown tab → overview). Each tab loads its own data when first opened; the password form keeps what was typed while you switch tabs; one failing panel does not stop another.

## Tabs
1. **Security Overview** — the account-protection explanation with its documented criteria (no score), account facts (email, last sign-in, password changed, history recorded since), **Account Recovery** (email verified/not, mobile not available, recovery codes not available, password reset by email available/not), the five most recent security events.
2. **Password** — the one shared change-password form and what a change does (other devices signed out, new session id for this browser).
3. **Two-Step Verification** — "Not available" with the reason; no switch, checkbox, button or form (BLOCKED, see PAGE_38_TWO_FACTOR_RULES.md).
4. **Active Sessions** — table from 900 px, cards below: device label, signed in, last active, status, "This device" badge on the current one (no revoke button on it), Revoke on the others with a confirmation naming the device and saying this device is not affected; Sign Out Other Devices with a confirmation that states the count. Notes: labels come from what the browser reports; location is Unknown; a browser that signed in before session tracking is not listed and the page says so.
5. **Login Activity** — range choice (default last 90 days); sign-in/failed/sign-out table (cards on phones) and the security events timeline; empty state "Login history will appear here as new sign-in events are recorded"; note that IP addresses and locations are not recorded and a failed attempt is not proof of an attack. Older entries on request.
6. **Security Notifications** — the alerts raised on this account (all / unseen), "Mark as seen", and what the buyer is told about; a statement that these notices are mandatory, in-app only and cannot be switched off.

## States
Skeletons while loading; per-tab error with Try again; empty states that say what they mean; rate-limit and failure messages that say nothing was changed; dialogs fit 320 px, take focus, close on Escape and return focus.

## Not shown (not supported)
Enabling/disabling two-step verification, recovery codes, changing recovery email/mobile, location, IP addresses, email alerts, configurable security alerts.
