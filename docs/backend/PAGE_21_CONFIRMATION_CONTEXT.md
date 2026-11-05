# Confirmation context

Code: `src/lib/auth/resetConfirmation.ts`; cookie set in `src/app/api/auth/reset-password/route.ts`.

- **Issued** only by `POST /api/auth/reset-password` after the transaction committed. A GET, a failed reset, a weak password or an unknown link never sets it (test P21-06).
- **Cookie** `finbyn_reset_ok`: payload `{ e: <security_events id>, x: <expiry ms> }` plus HMAC-SHA256 over `reset-confirmation:<payload>` with `AUTH_SECRET` (domain-separated, so a session cookie is never a valid confirmation and the reverse; P21-04). httpOnly, SameSite=Lax, `Path=/password-reset`, 10 minutes (`AUTH_RESET_CONFIRMATION_MINUTES`, 2-60), `secure` in production. No email, role, token, password or hash inside (P21-09).
- **Read** by `getPasswordResetConfirmation()`: signature, then expiry, then one lookup of the event by `_id` (projection `at, role, sessionsRevoked`; type must be PASSWORD_RESET). The event's own age is also limited to the window, so a signed cookie cannot outlive it (P21-20). States: VALID, MISSING, INVALID, EXPIRED, UNAVAILABLE.
- **Not a credential:** `getCurrentUser()` never reads it; with only this cookie `/api/auth/me` shows nobody, buyer APIs refuse, and the reset route refuses a request with no token (P21-15). It cannot repeat a reset.
- **Refresh:** the page can be reloaded until the window ends; reloads change nothing in the database (P21-12). Each confirmation is bound to its own event (P21-17).
- **Cleanup:** the cookie expires by itself; `security_events` rows are an audit record and are kept.
- Not tested: a database failure during the lookup (UNAVAILABLE) was not simulated; the code returns the state and the page renders its message.
