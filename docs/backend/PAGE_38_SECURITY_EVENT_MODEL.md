# Page 38 — Security event model

One collection, `security_events` (rows from earlier pages are kept as they are), read by `GET /api/buyer/security/events` and the sign-in subset by `/login-activity`. Code: `src/lib/security/securityEvents.ts`, `securityRules.ts`.

| Type | Written by | Notes |
|---|---|---|
| LOGIN_SUCCEEDED | login route | `sessionPublicId`, `deviceLabel`, `newDevice` |
| LOGIN_FAILED | login route (existing account, wrong password) | coalesced per 15 minutes, `count` |
| LOGOUT | logout route | only for a session really ended |
| PASSWORD_CHANGED | change-password route (existing event) | |
| PASSWORD_RESET | reset transaction (existing event) | has a hashed client address from Page 20, never returned |
| SIGNED_OUT_EVERYWHERE | sign-out-others service | `count` of sessions ended |
| SESSION_REVOKED | revoke-one service | `sessionPublicId`, `deviceLabel` |
| SECURITY_ALERT | alert creation | `alertId` |

Row: `userId`, `type`, `at`, optional `sessionPublicId`, `deviceLabel`, `newDevice`, `count`, `alertId`, `dedupeKey` (unique per account where present), `purgeAt` (TTL). Old rows (`fields`, `ipHash`, profile and document types) are not security events for this page: the timeline lists only the types above (`$in`), so profile edits, document uploads and address changes never appear.

Indexes: `user_events_newest` (userId, at -1, _id -1), `user_events_by_type` (userId, type, at -1, _id -1), unique partial `user_event_once` (userId, dedupeKey), TTL `event_retention` (purgeAt). Retention: 365 days; failed sign-ins 90.

Rules: events are written by the code that performs the action, never by reading a page; a write failure never breaks the action (logged by type only); no IP address, password, token, cookie, raw User-Agent or device key is stored in or returned from an event (the answer is an allow-listed DTO: id, type, title, description, status, time, device label, count, newDevice); a retry cannot add a second event where a key exists (failed-sign-in bucket, alerts); order is time then id.
