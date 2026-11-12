# Page 38 — Buyer data isolation

- Identity only from the verified session (`requireBuyerApi`); `userId` is never read from a body, address, query string or storage. Suppliers get 403, anonymous visitors 401 (routes) or a sign-in redirect (page), a suspended buyer 401.
- Sessions: every query names the session buyer; a session is addressed only by its random 16-hex public id; another account's session, an unknown id, an expired or already ended one and a malformed id answer the **same** 404 (tested), so ids cannot be probed. Raw session ids and hashes are never returned; the current session is computed from the cookie, not sent.
- Events and alerts: `{ userId: <session buyer> }` on every list, count and acknowledgement; another buyer's events never appear; an alert of another account cannot be acknowledged (404).
- Recovery and overview: the buyer's own record only; the email is masked, the mobile number masked to four digits, no code or secret exists to return.
- Answers are allow-listed (tested): no token, cookie, session-id hash, device key, IP address, raw User-Agent, user id, retention date or dedupe key.
- State changes (end session, sign out others, acknowledge) refuse requests marked cross-site or from another origin, on top of the SameSite=Lax cookie.
- Another buyer's sessions are untouched by a revoke-others call (tested); no route can end, list or read a session of a different account.
