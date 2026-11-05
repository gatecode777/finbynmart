# Page 25 — Communication preferences

Rule from the PRD: show a preference as enabled only when its delivery mechanism is operational; never claim an SMS, email or WhatsApp message can be delivered when the service is not there.

| Channel | State | What the buyer sees |
|---|---|---|
| In-app (the Notifications list) | **Operational** | Three categories: Inquiry updates (switchable), Company and documents (switchable), Account and security (required, "Always on") |
| Email | Not available | "Email, SMS and WhatsApp notifications — not available yet. No delivery service is connected." The mail provider exists only for verification and password-reset messages when configured; no notification email is sent |
| SMS | Not available | same |
| WhatsApp | Not available | same |
| Promotional offers, product recommendations | Not available | No marketing is sent, no consent record exists, nothing is pre-enabled. Adding it needs a consent policy, a stored consent record with timestamp and wording version, and a delivery channel |
| Quotation updates, order updates | Not available | No quotation or order modules exist, so there is nothing to notify about |

## Transactional versus marketing
Only transactional, in-app notices exist. The `account` category (password changed, signed out of all devices) is required: it is always created and the server refuses any attempt to switch it off, so a preference can never silence a security notice.

## Enforcement
Preferences are applied in `notifyBuyer` (server, where the notice is created), through one indexed read of `buyer_settings`. A notice for a switched-off category is simply not created; the action that caused it still succeeds (tested for inquiries and company documents).

## When a channel is added
1. Add the channel's setting fields to `buyer_settings` and to `validateSettings` together with the delivery code.
2. Check `emailConfigured()` (or the equivalent) in the UI and API: show the control only when delivery works.
3. Record consent changes (who, when, wording version) for any optional or marketing channel.
4. Keep the required categories outside the preference model.
