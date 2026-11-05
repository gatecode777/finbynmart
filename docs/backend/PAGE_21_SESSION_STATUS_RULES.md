# Session status wording rules

Three separate operations are never conflated: password update, reset-token consumption, and revocation of the account's sessions (plus, separately, clearing this browser's own session cookie).

- The page says "Your previous login sessions on this account have been ended" ONLY when the stored `security_events` row has `sessionsRevoked: true`. That field is set to true in the same transaction that bumps `users.sessionVersion`, which is what invalidates older cookies (see PAGE_20_SESSION_REVOCATION.md).
- If an event does not record it, the page shows the neutral line "Sessions that were already signed in elsewhere may stay active until they expire" and claims nothing (test P21-18, using an event inserted without the flag).
- The "sessions ended" line is ticked (done) when stated; "Sign in" and "Continue" are never ticked.
- Verified end to end: a cookie saved before the reset is refused after it (P21-26, H-20).
- Not covered: a reset whose revocation failed cannot occur in the current design (it is atomic with the password update), so a "revocation failed" state is not reachable and was not built.
