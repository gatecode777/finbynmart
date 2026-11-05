# Page 21 security report

| Control | Result | Test |
|---|---|---|
| Success cannot be inferred from the URL or query string | Pass | P21-01, P21-02 |
| Forged, foreign (session cookie), unknown-event, wrong-type and oversized cookies never show success | Pass | P21-04 |
| Expired confirmation says expired, not success; a signed cookie cannot outlive the window; wrong event type refused | Pass | P21-05, P21-20, P21-21 |
| Confirmation only after a committed reset; failed resets set none | Pass | P21-06, P21-07 |
| Cookie flags and contents (no PII, token, password) | Pass | P21-08, P21-09 |
| Role from the stored account; client role ignored; confirmations bound to their own reset | Pass | P21-11, P21-17 |
| Confirmation is not a credential and cannot redo a reset | Pass | P21-15 |
| Refresh changes nothing | Pass | P21-12, P21-25 |
| No email, token, password, hash or cookie value in the page or the logs | Pass | P21-13, P21-34 |
| no-store, no-referrer, noindex | Pass | P21-03 |
| Truthful session wording | Pass | P21-18 |

Not verified: HTTPS and `secure` cookie behaviour (the local server is http), a database failure during the lookup, any attack on the HMAC (256-bit; none attempted), third-party review. Cross-account: a confirmation cookie can only show its own reset's role; there is no endpoint that takes an id.
