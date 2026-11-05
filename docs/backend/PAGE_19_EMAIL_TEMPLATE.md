# Recovery email

Code: `src/lib/auth/mail.ts` (template) and `src/lib/email/provider.ts` (transport).

- Subject: `Reset Your Finbyn Mart Password`.
- Body: plain-text and HTML parts. HTML has the Finbyn Mart logo (`APP_URL/images/brand/finbyn-mart-logo.png`), the heading "Reset your password", a greeting with the account name, one sentence of explanation, a **Reset Password** button, the link as plain text (for clients that block buttons), the validity ("works once and expires in 30 minutes", from the setting), "if you did not ask for this, ignore this email", and "Finbyn Mart will never ask for your password by email".
- Safety: the name is HTML-escaped; the link is built from `APP_URL` only (never the Host header; in production without `APP_URL` nothing is sent); no password, hash or account detail beyond the name; the raw token appears only in the link and is never logged.
- Support details: none are shown, because no support email or phone is confirmed (the footer says contact details are to be confirmed). Add them here when they exist.
- Transport honesty: `sendEmail` returns `sent` only when the provider answered 2xx ("provider accepted", not "delivered"), `failed` with a short reason otherwise, and `not_configured` when `EMAIL_API_KEY` or `EMAIL_FROM` is missing. With no credentials no token is created and the API says email is not set up.
- Tested (local stand-in provider that records requests, **not** a real email service): subject, bearer key, recipient, link on `APP_URL`, forged Host ignored, logo, button, 30-minute text, ignore advice, no password in the body (G-03 to G-05, M-03 to M-05, M-27).
- Not tested: rendering in real mail clients, spam scoring, real delivery.
