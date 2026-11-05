# Recovery rate-limit policy

Limiter: `rateLimit()` (MongoDB fixed windows, shared across instances, one write per check). Constants in `src/lib/auth/securityConfig.ts`.

| Limit | Key | Allowed | Applies to |
|---|---|---|---|
| Per client address | `forgot:<ip>` | 10 per hour | forgot-password and resend (shared) |
| Cooldown | `forgot-cd:<normalised email>` | 1 per 60 s (config 30-600 s) | forgot-password and resend (shared) |
| Per address | `forgot-email:<normalised email>` | 3 per hour | forgot-password and resend (shared) |
| Token validation | `reset-validate:<ip>` | 30 per 10 minutes | `/api/auth/reset-password/validate` |
| Reset | `reset:<ip>` | 20 per 10 minutes | `/api/auth/reset-password` |
| Confirmation | `verify:<ip>`, `resend:<ip>`, `resend-email:<email>` | 20 per 10 minutes, 10 per hour, 3 per hour | confirmation flow |

Design points: the limits depend only on the request (address, email text), never on whether an account exists, so a 429 reveals nothing. They apply after the cheap syntax check, so a typo does not use an attempt. A limited request does no lookup and sends nothing. The frontend countdown mirrors `retryAfter`/`cooldownSeconds`, but the server enforces everything. A person cannot be locked out of their account by recovery requests: limits only slow the emails, and sign-in has its own limit.

Behaviour of fixed windows: a client can send up to twice the limit across a window boundary. The limiter fails open if the database is unreachable (a limiter outage must not take the site down), so recovery requests are then not limited.

Tested: F-14 (second request within the cooldown gets 429 with `Retry-After` of at most 60), F-14b (the 4th request in an hour is 429 even with the cooldown bypassed), G-02 (resend shares the cooldown), M-20.
