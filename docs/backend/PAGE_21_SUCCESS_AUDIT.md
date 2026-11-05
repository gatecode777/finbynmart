# Page 21 audit

Verified 2026-11-03 before the work.

- `/password-reset/success` did not exist. Page 20 rendered its own success screen inside the form from the browser's own state, so nothing on the server could prove a reset had happened.
- Page 20's real success evidence: the reset transaction (`lib/auth/passwordReset.ts`) commits token consumption, the new hash, the session-version bump and a `security_events` row `PASSWORD_RESET`. The role is read from the stored user inside that transaction.
- Session revocation: real, by `users.sessionVersion` (Page 20). It is part of the same commit, so "sessions revoked" is true exactly when the event exists.
- Existing flash/result mechanism: none. A new collection was not needed: the existing `security_events` row is the stored proof.
- Support route: `/contact-us` exists. Login routes: `/login/buyer` and `/login/supplier` are aliases to `/sign-in` (Page 20).
- Risks addressed: success inferable from the URL or a query string; role taken from the client; confirmation reused as a credential; success shown for a failed or replayed reset; refresh repeating work.

## Plan carried out

A signed short-lived confirmation cookie issued by the reset route after commit, bound to the event id; the success page reads the cookie and the event; role and `sessionsRevoked` come from the event; query strings are ignored; fallback states; truthful steps.
