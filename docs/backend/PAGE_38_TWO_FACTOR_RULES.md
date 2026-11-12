# Page 38 — Two-step verification: BLOCKED

**Status: not available. Nothing is simulated.**

Audit result: the site has no second-factor mechanism. There is no TOTP implementation, no SMS or email one-time-code service (the email provider is optional and unconfigured; there is no SMS provider), no recovery codes, and the sign-in route has no second step. A mobile number is stored but never verified.

What the page does: the overview card says "Not available"; the Two-Step Verification tab states the reason and what protects the account meanwhile; there is **no switch, checkbox, button or form** on that tab (tested: zero controls); `capabilities.twoFactor` and `capabilities.recoveryCodes` are `false`; the routes `/api/buyer/security/2fa/setup|verify-setup|disable` do not exist (404, tested). Recovery codes are shown as not available because they belong to 2FA.

Why it was not built here: a second factor changes the sign-in itself (a challenge step, attempt limiting, replay protection, secret storage, recovery without a bypass) and would be a second authentication architecture, which the PRD forbids; an insecure shortcut is worse than none.

What a proper implementation needs (for a later decision): TOTP (RFC 6238) with the secret encrypted at rest; a pending-setup state confirmed by a valid code; a login challenge after the password step with a bounded number of attempts and a used-code window (replay prevention); recovery codes stored as hashes and shown once; disabling requires the password and a valid factor; events and alerts for enable/disable; a documented lost-device recovery that does not bypass verification.
