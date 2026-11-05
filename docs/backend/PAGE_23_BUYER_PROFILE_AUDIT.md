# Page 23 audit

Verified on 2026-11-03 against the repository and the test database, before the work.

| Area | State found |
|---|---|
| `users` | role, `accountStatus`, `emailVerified`, `phoneVerified`, `phone`, `companyName` (typed at registration), `consent`, `sessionVersion`; no designation, alternate contacts, version field or company link |
| Company model | **none**: no `companies` collection, no company ownership, no company verification |
| Document model | **none** for buyers. The supplier certification module (Page 11) has a private directory and magic-byte checks but no upload path and is supplier specific |
| File storage | private local directory pattern only; **no ImageKit**, no object store |
| Email provider | present only as the Resend-style adapter (no credentials configured) |
| SMS / OTP | **none** |
| Admin role or review process | **none** |
| Password change | no authenticated change-password route (only reset by email link) |
| Sessions | stateless cookies with a version; revocation by version bump (Page 20); no device list |
| Audit | `security_events` (Page 20), field names only |
| Rate limiting, RBAC | rate limiter exists; role is buyer or supplier, enforced by the Page 22 guards |

## Gaps and what was done

| Gap | Resolution |
|---|---|
| No company model | `companies` created (documented reason: nothing existed): one owner per buyer (`ownerUserId` unique), unique normalised legal name, `verificationStatus` fixed `UNVERIFIED`, `version` for conflicts |
| No document model | `company_documents` created with a partial unique index per company and type; files in private storage |
| No change-password | `POST /api/auth/change-password` (shared hashing and policy, sessions of other devices revoked) |
| Profile fields | `designation`, `alternatePhone`, `alternateEmail`, `profileVersion` added to `users` |
| Email change, mobile OTP, profile photo, company membership roles, admin verification | **BLOCKED** (no infrastructure); shown as unavailable, not simulated |

## Risks noted

Local-disk storage is not durable on serverless hosting (a hosted private object store is needed before deploying); a single company owner means no team access; names are claimable only by contacting support (no claim workflow); a buyer who loses access to their email has no recovery path through this page.
