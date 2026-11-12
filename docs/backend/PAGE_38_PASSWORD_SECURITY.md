# Page 38 — Password security

One implementation, reused: `POST /api/auth/change-password` (unchanged contract), one shared form (`ChangePasswordForm`, now used by the profile page, the settings page and Account Security), scrypt hashing and the shared policy (10–128 characters, `checkBuyerPassword`).

Behaviour (all tested, group G):
- The **current password is verified on the server**; a wrong one is refused 400 on that field, nothing changes. Attempts that really test it are limited to **5 per 10 minutes per account** (6th → 429).
- The new password must pass the policy, match its confirmation, and **differ from the current one** (reuse refused). Earlier passwords are not remembered (no password history exists).
- A new scrypt hash replaces the old (never returned; the answer holds no hash); the change time is set; the session version is raised.
- **Session policy (documented, not silent):** every other device is signed out (their registry records end as `password_changed`); this browser stays signed in but receives a **new session id** (old one retired as `rotated`, creation time and device kept), so a cookie that existed before the change is refused (tested). The page tells the buyer this before they submit.
- Records: PASSWORD_CHANGED event, a "Password changed" alert (info, once per change) and an in-app notification. No password text appears in any of them; passwords are never logged or kept in browser storage (the form clears on success).
- Without a session: 401. Old password no longer signs in; the new one does.
- Not done: breached-password checking, password history, forced periodic change, step-up for other actions, an email notice of the change (no security email is configured).
