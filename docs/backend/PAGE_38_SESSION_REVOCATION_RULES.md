# Page 38 — Session revocation rules

Service: `src/lib/buyer/securitySessions.ts` (`revokeBuyerSession`, `signOutOtherDevices`). Routes: `DELETE /api/buyer/security/sessions/[sessionId]`, `POST /api/buyer/security/sessions/revoke-others`, and the Settings button `POST /api/buyer/settings/sign-out-everywhere` (the same service).

## End one session
1. Buyer from the session; request must not come from another site (`Origin`/`Sec-Fetch-Site` check, 403); 20 per buyer per 10 minutes.
2. `sessionId` must be a 16-hex public id; otherwise the same 404 as an unknown one.
3. The record is looked up by (this buyer, public id, still active). Not found — another account's session, an unknown, an expired or an already ended one — is one and the same 404.
4. The session **in use** cannot be ended here (409 "use Sign out"): a click on the wrong row never signs the buyer out of the page.
5. One conditional update sets `revokedAt` and `revokedReason: "user"`. **The next request from that browser is refused** (the authentication layer reads the record): proven by test C-01 (that browser's `/api/auth/me` returns no user and the security API answers 401, having worked a moment earlier).
6. Then one SESSION_REVOKED event (device label, public id), one alert and one notification are recorded, each once (three simultaneous requests → one success, two 404, one of each record).

## Sign out other devices
Registered sessions except the current one are revoked in one update and **counted** (the real number is returned). The account's session version is then raised, which also ends cookies issued before the registry; this device keeps its record (same creation time and device) and receives a cookie for the new version. One SIGNED_OUT_EVERYWHERE event (with the count), one alert, one notification. If raising the version fails after the registered sessions were ended, the answer is an honest 503 that says how many were ended and that older sessions could not be; it never claims full success. 5 per buyer per 10 minutes.

## Other ways a session ends
Logout (`logout`), password change (others `password_changed`, this one `rotated`), password reset (`password_reset`), the 20-session cap (`limit`), expiry (7 days), a suspended account (refused at once).

## Not done
Step-up authentication before revoking (revocation only reduces access, and the account holder is already signed in); revoking the current session from the list (Sign out does that).
