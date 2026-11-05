# Page 25 — Buyer settings data model (`buyer_settings`)

One document per buyer. Absent until the first save: reading never creates it, and a buyer with no document gets the defaults at `version: 0`.

| Field | Type | Notes |
|---|---|---|
| `buyerId` | ObjectId | From the session only; unique |
| `notifications.inquiries` | boolean | In-app notices for inquiry events (default on) |
| `notifications.company` | boolean | In-app notices for company-document events (default on) |
| `dashboardRange` | `7d` `30d` `90d` `this-month` `previous-month` | Period the Buyer Dashboard opens with (default `30d`); `custom` is not storable |
| `version` | int | 1 on creation; saves must send the version they loaded |
| `createdAt`, `updatedAt` | Date | Server time |

The `account` notification category is **not stored**: it is required and always created, so it cannot be switched off (a `notifications.account` in a request is refused).

**Index:** `one_settings_per_buyer`, unique `{buyerId: 1}`. Two simultaneous first saves: one inserts, the other hits the unique index and gets 409 (tested: 200, 409, 409).

**Why not fields on `users`:** `users` holds credentials and session state and is read on every request; settings change independently, are saved with their own version, and a racing settings save must never touch the account.

**Audit:** `security_events` type `SETTINGS_UPDATED` with setting names only (no values).

**Deliberately not stored** (no feature consumes them): language, timezone, currency, date/number format, marketing consent, profile visibility, business preferences, integrations. Add a field here only together with the feature that uses it.
