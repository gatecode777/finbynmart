# Page 38 — Recovery rules

`GET /api/buyer/security/recovery-methods` (`getRecoveryMethods`). Only what can really recover the account is shown as usable.

| Method | State shown | Why |
|---|---|---|
| Email | **Verified** (masked, e.g. `t******@example.test`) when `emailVerified` is true; **Not verified** otherwise, with the note that an unconfirmed address is not used for recovery | the address is confirmed by the existing emailed-link flow |
| Mobile | **Not available** (masked to the last four digits) when a number is saved; **Not set up** when none | there is no SMS service, so no number has ever been verified and it is never treated as a recovery method |
| Recovery codes | **Not available** | they belong to two-step verification (blocked) |
| Password reset by email | **Available** only if the email service is configured AND the address is confirmed; otherwise **Not available** with the reason ("the email service is not configured on this server" / "confirm your email address first") | the reset link needs a mail provider |

Rules kept: the full address, codes and secrets are never returned; the overview treats an unconfirmed email as "Incomplete"; recovery changes are not offered on this page because the underlying flows do not exist for buyers (there is no change-email or mobile-OTP flow), so there are no sensitive recovery edits to protect, and no recovery alert is raised. Updating the email or mobile and regenerating codes are BLOCKED until those flows exist.
