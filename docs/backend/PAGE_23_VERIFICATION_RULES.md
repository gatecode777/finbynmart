# Verification rules

Four separate systems, each reported on its own (`GET /api/buyer/verification`):

| System | Source | State today |
|---|---|---|
| Email | `users.emailVerified`, set only by the emailed link (Pages 15/19/20) | Not confirmed until the link is used. "Send a new confirmation link" is offered only when an email provider exists (otherwise 503 `not_configured`; nothing is claimed as sent). "Sent" means the provider accepted the message |
| Mobile | `users.phoneVerified` | Always false: no SMS service, so a code cannot be sent. The page says so and shows the masked number; no "OTP sent" is ever claimed |
| Company | `companies.verificationStatus` | `UNVERIFIED` with "not available yet": there is no review process or admin role |
| Documents | `company_documents.verificationStatus` | `PENDING` after upload; REJECTED / VERIFIED / RESUBMISSION_REQUIRED are shown correctly if a reviewer ever sets them; EXPIRED is computed from a verified document's expiry date |

Rules: a buyer can never set any of these (every attempt is refused or there is no route; E-07). Confirming an email or phone is **not** business verification and the page says so. The profile completion does not count business verification. The rejection reason is returned only to the owner.

Changing the primary email or mobile number would need re-verification workflows that need providers that do not exist; both fields are read-only here with that explanation.

Tested: E-01 to E-08.
