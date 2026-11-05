# Reset-link URL security

The link is a bearer secret. What is done, and where:

| Rule | Implementation | Test |
|---|---|---|
| GET never changes anything | Page load and validate only inspect; the form's POST consumes | H-08, H-60 |
| `Cache-Control: no-store` | `next.config.ts` headers for `/reset-password`, `/verify-email`; `private, no-store` for `/api/auth/*`; each reset/validate answer also sets it | H-40, H-41, H-12 |
| `Referrer-Policy: no-referrer` | header in `next.config.ts` and page metadata | H-40, P-10 |
| `noindex, nofollow` | page metadata | H-40 |
| Token out of the address bar | `history.replaceState` after load; the token lives in component memory only | H-44 |
| No browser storage | nothing is written to localStorage or sessionStorage | H-45 |
| No logging | the server never logs the token, link or password (stage logs hold only milliseconds) | H-42, G-13 |
| No analytics | none is installed on the site; no third-party script runs on this page | by inspection |
| HTTPS | production links are built from `APP_URL` (use https); `secure` cookies in production | not testable on the local http test server |
| No open redirect | the destination is chosen on the server from `/login/buyer`, `/login/supplier`; the client only accepts those two (else `/sign-in`) | H-10, H-24 |
| No role or user from the URL | never read | H-10 |

Known trade-offs: after the token is stripped, a refresh shows "link incomplete" and the person reopens the email link (the token cannot be kept in the address bar and out of it at once). The token is part of the page's server-rendered data for the load that carried it (it has to reach the form), so it exists in that response body and in memory until the tab closes; it is not in storage or history.
