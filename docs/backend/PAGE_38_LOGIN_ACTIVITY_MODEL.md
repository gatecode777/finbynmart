# Page 38 — Login activity model

Login activity is the sign-in subset of the security events (`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`); there is no second history. API: `GET /api/buyer/security/login-activity?limit=&before=&range=7d|30d|90d|all`.

- **History starts when recording started.** Before this page nothing was recorded, so nothing earlier is shown or invented. The page says "Login history will appear here as new sign-in events are recorded… Nothing before that was kept", and the overview shows when the first recorded sign-in happened. An empty list is never presented as "no suspicious attempts".
- **LOGIN_SUCCEEDED** — written by the login route after the session exists: public session id, device label, `newDevice` flag.
- **LOGIN_FAILED** — written only by the login route, only when the email belongs to an account and the password is wrong. Failures are **coalesced**: one row per account per 15-minute bucket with a `count` (unique key `failed:<bucket>`), so guessing cannot fill the owner's history. Nothing is stored for an unknown email. Opening the page never creates one. It is shown as "Failed sign-in attempt (n)", not as an attack.
- **LOGOUT** — only when a session was really ended (a replayed, already ended cookie records nothing).
- **Shown per entry:** event, device label ("Chrome on Windows", from the browser's own header: can be wrong), time, result. **Not recorded and not shown:** IP address, raw User-Agent, location (no approved source), password, token.
- **Paging:** newest first, 20 a page (50 max), cursor = time + id (same-millisecond events are not repeated or skipped: tested with 30), bounded range (default 90 days, "All recorded" = the retention).
- **Retention:** failed sign-ins 90 days, other events 365 days (TTL on `purgeAt`).
- **Isolation:** every query is `{ userId: <session buyer> }`; another buyer's events never appear.
- Registration creates a session but no sign-in event (the account was just created); the first LOGIN_SUCCEEDED is the first real sign-in.
