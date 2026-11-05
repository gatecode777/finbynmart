# Page 23 security report

| Control | Result | Test |
|---|---|---|
| All 12 endpoints refuse a request with no session (401, private) | Pass | A-01 |
| Supplier accounts refused by every buyer endpoint (403); suspended buyer refused (401); page redirects to sign-in and back to the same tab | Pass | A-02 to A-05 |
| Explicit update allowlist; 16 server-only fields (role, status, flags, hash, permissions, session version, company id, user ids, primary email and phone, created time, id) are refused with 400, not ignored; record unchanged | Pass | B-07, U-09 |
| Buyer B cannot change A's profile by naming A in the body | Pass | B-08 |
| Stale form or simultaneous saves: only one wins (409) | Pass | B-05, B-11, C-10 |
| Company ownership from the session only; one company per buyer; no claiming a name; B sees nothing of A's company | Pass | C-05 to C-08 |
| Verification status, owner, normalised name, documents and role cannot be sent | Pass | C-13, U-23 |
| Document type, extension, real content, size, emptiness, double extension, disguised HTML all validated; a buyer cannot choose a status | Pass | D-01, D-05 to D-07 |
| Files stored under random names outside `public/`; the original name is display text | Pass | D-03 |
| Private streaming only for the owner; others, anonymous and traversal ids get 404/401 and no bytes; hardened headers | Pass | D-09, D-10, D-12 |
| A verified document cannot be replaced or removed by the buyer; a replaced document's old id stops working | Pass | D-11, D-13 |
| Another buyer cannot delete or list documents | Pass | D-15, D-17 |
| Audit trail stores field names and document types only (no names, addresses, file names) | Pass | B-10, C-14, D-18 |
| No buyer route can set a verification state | Pass | E-07 |
| Change password: current password required, shared policy, same-password refused, hash replaced, other devices signed out, this one stays in, event without secrets | Pass | G-02 to G-07 |
| Limits: change-password 5 attempts per 10 minutes (only attempts that test the current password count); profile writes 30, company writes 20, uploads 20 per 10 minutes | Pass | G-08, H-01 (company and upload limits are implemented; not separately exercised) |
| Private, no-store responses; no hash or session data in any answer | Pass | A-01, B-02, G-01 |
| Storage not configured: uploads refused (503), stated in the UI | Pass | N-01 to N-04 |

Not verified or open: virus scanning of uploads; HTTPS; CSRF beyond SameSite=Lax cookies and JSON/multipart bodies; durable private storage in production; the email-resend route with a real provider (E-06 covers the no-provider answer; the sending path is the shared `sendAccountEmail` tested in Page 19); no admin role exists, so reviewer routes cannot be tested; no third-party review.
