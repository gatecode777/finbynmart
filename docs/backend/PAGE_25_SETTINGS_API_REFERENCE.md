# Page 25 — Settings API reference

All routes: buyer session required (401 without; 403 for a supplier; a suspended buyer's session no longer works), private `no-store` responses, shape `{ ok, message, fields?, code?, data? }`. The buyer is always taken from the session.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/buyer/settings` | `data.settings`: `{ notifications: { inquiries, company }, dashboardRange, version, updatedAt }` (defaults at version 0 if never saved) |
| PATCH | `/api/buyer/settings` | Save everything: body `{ notifications: { inquiries, company }, dashboardRange, version }`. 30 per 10 minutes per buyer |
| POST | `/api/buyer/settings/sign-out-everywhere` | No body. Raises the session version (every other device is signed out), gives this device a fresh cookie, creates a required account notification. 5 per 10 minutes |
| POST | `/api/auth/change-password` | Existing route (Page 23): current password, new password, confirmation; other devices signed out; creates a required account notification |

## Errors
400 with `fields` per field: unknown keys (including `buyerId`, `role`, `language`, `currency`), `notifications.account` (required category), non-boolean values, a period outside the five presets (`custom` refused), an operator object, a bad `version` · 401 · 403 · 409 `CONFLICT` (stale version, or a lost first-save race; nothing changes) · 429.

## Behaviour notes
- The page shows "saved" only after a 200; the form keeps the unsaved values and the error if the call fails.
- The dashboard reads the saved period only when its address has no `range`, `startDate` or `endDate`; an explicit range always wins.
- Notification preferences are applied on the server when a notice would be created; the browser cannot bypass them.
