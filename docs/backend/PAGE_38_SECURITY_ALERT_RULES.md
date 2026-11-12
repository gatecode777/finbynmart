# Page 38 — Security alert rules

Collection `security_alerts` (`userId`, `type`, `severity` info|warning, `title`, `summary`, `recommended`, `createdAt`, `acknowledgedAt`, `dedupeKey`, `purgeAt`). Alerts are raised only by code that observed the real event; reading a page raises nothing. Each alert also writes one SECURITY_ALERT event.

| Alert | Rule (the only signals used) | Severity | Once per |
|---|---|---|---|
| New device sign-in | a successful sign-in from a browser/OS/device-type combination that **has no record in any of the account's sessions** (current or ended within the retention), **and the account already had a session** (the first sign-in of an account is never a "new device") | info | session (`newdevice:<publicId>`) |
| Repeated failed sign-ins | **5 or more** wrong-password attempts for the account in one 15-minute window | warning | hour (`failed:<hour>`) |
| Password changed | the buyer changed the password while signed in | info | change (`password:<version>`) |
| A device signed out | the buyer ended one session | info | session |
| Other devices signed out | the buyer signed out other devices | info | change (`signout:<version>`) |

No claim of AI or fraud detection is made: these are fixed rules over recorded events, and a "device" is the browser's self-reported browser/OS, which can change (a browser update does not change it; a different browser does). A new-device alert is therefore informational ("if this was you, no action is needed"), not an accusation. The detection thresholds are published here but the page does not show them.

- **Notifications:** a new-device, repeated-failures and device-signed-out notice are created in the buyer's in-app notifications (category `account`, required, cannot be switched off); password change and sign-out-everywhere notices already existed. Duplicates are prevented by the dedupe keys (tested: a second sign-in from the same browser and eight failures in an hour create one alert and one notification). **No email is sent**: security email is not set up, and the page says so. In-app creation is not presented as delivery to a mailbox.
- **Acknowledge:** `PATCH /api/buyer/security/alerts/[alertId]/acknowledge` marks the buyer's own alert seen; repeating it keeps the first time; another account's or an unknown alert is the same 404; cross-site requests are refused.
- **Status:** an unseen warning makes the account status "Action Required"; acknowledging it returns the status to "Protected" (when the email is confirmed).
- **Configurable alerts:** none. Security notices are mandatory by policy; the Security Notifications tab lists what is sent and says they cannot be switched off. Optional/marketing preferences cannot disable them.
