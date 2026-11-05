# 11 — Security Audit

Static review of source and configuration plus `npm audit`. No destructive or live attack testing was performed. No secrets appear in this report.

## What was checked and the result
| Area | Result | Evidence |
|---|---|---|
| Password hashing | Good | scrypt, per-user 16-byte salt, constant-time compare (`lib/auth/password.ts`) |
| Session cookie | Good with caveats | httpOnly, SameSite=Lax, Secure in production, 7-day expiry, HMAC-SHA256, constant-time signature check; secret must be ≥ 32 chars |
| Session revocation | Weak | Stateless token; logout only clears the cookie |
| Login errors | Good | Same message for unknown email and wrong password |
| Registration errors | Weak | 409 "already registered" allows email enumeration |
| NoSQL injection | Mitigated | All body fields pass through `str()` so operators/objects become empty strings |
| XSS | No sinks found | `dangerouslySetInnerHTML` appears nowhere in `src/` |
| CSRF | Partially mitigated | SameSite=Lax cookie; JSON bodies; no CSRF token. Login-CSRF possible in principle |
| RBAC / IDOR | Not applicable yet | No role checks, but also no private per-user data or protected routes exist |
| Rate limiting | **Missing** | No limits on login/register/me |
| File upload | Not applicable | No upload feature |
| Security headers | **Missing** | `next.config.ts` sets no CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Env handling | Good | `.env*` git-ignored (`!.env.example`); history audited earlier: no secrets committed; `.env.example` holds placeholders |
| Dependency vulnerabilities | See below | `npm audit --omit=dev` |

## Findings
| ID | Finding | Severity | Notes |
|---|---|---|---|
| S1 | No rate limiting or lockout on authentication endpoints | High | Credential stuffing, brute force, signup spam |
| S2 | MongoDB credential was pasted into a chat session; Atlas network access is `0.0.0.0/0` | High (operational) | Rotate the database password and restrict IP access/use Vercel integration. **User action.** |
| S3 | `public/` contains `real_clothing_products.csv/.xlsx` and `sellers.csv/.xlsx` (raw research data including seller contact columns). They are git-ignored, so Git-based deploys omit them, but they are web-reachable from any deployment built from a local folder (and via `next start`/`next dev` locally) | Medium–High | Move outside `public/` (e.g. `data/`) |
| S4 | No session revocation; 7-day tokens remain valid after logout/theft | Medium | |
| S5 | No email verification; anyone can register as a supplier with any address | Medium | Also blocks trustworthy "verified supplier" claims |
| S6 | No security headers | Medium | |
| S7 | Dependency advisories: `postcss ≤ 8.5.22` (high; XSS via `</style>` in stringify output and `sourceMappingURL` file-read issues) pulled in by `next`; npm reports `next` as moderate via postcss. Fix offered is a breaking upgrade to Next 16. Exposure requires attacker-controlled CSS at build time, so practical risk is low, but it should be tracked | Medium (low practical) | `npm audit fix --force` not run |
| S8 | Registration enumeration (409) | Low | |
| S9 | Password policy is length ≥ 8 only | Low | |
| S10 | Public GitHub repo contains `db/seed/products.csv` from a research-licensed dataset and fictional seller records | Compliance | Decide: private repo or licensed data |
| S11 | `me` route hides backend errors | Low | Observability |
| S12 | Test users may remain in the live DB | Low | Delete |

No critical (exploitable-today, data-exposing) vulnerability was verified in the application code. The most important gaps are S1, S2 and S3.

## Not verified
Atlas configuration, Vercel environment/secret storage, TLS/headers on any deployed URL, behaviour behind a CDN, penetration testing.
