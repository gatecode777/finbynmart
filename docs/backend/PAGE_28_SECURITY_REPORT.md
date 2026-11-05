# Page 28 — Security report

Findings from `docs/page-reports/tools/27-28-buyer-inquiries-test.mjs` (production build, throwaway database). Not run: penetration testing, an external scanner.

| Control | Result |
|---|---|
| Authentication | Detail API and page: 401 / redirect to sign-in (with the reference to come back to) when signed out; supplier accounts 403 (API) and "Buyer accounts only" (page); suspended session rejected |
| Reference is an identifier, not access | The lookup is `{ reference, buyerId }` with the buyer from the session; knowing a reference grants nothing |
| Enumeration | Another buyer's, unknown and malformed references give the identical 404 page and API answer; nothing of the other inquiry (supplier or product names) is in the answer |
| Raw database ids | Not an address for an inquiry that has a reference (404); only an old record without a reference opens by id |
| Guest inquiries | Unreachable through a buyer account, even with the same e-mail |
| Data exposure | The detail answer has no buyer id, idempotency key, consent record, internal notification record, guest data, supplier contact fields, e-mail or phone |
| Related records | No quotations, responses, messages or attachments exist, so none can leak; company KYC documents are never listed here |
| Client-controlled state | Status, ownership, buyer, supplier, quotation and file references are never accepted from the client; the only write is cancel, which re-checks ownership and status on the server |
| Text rendering | The buyer's message is rendered as text (React escaping, `white-space: pre-wrap`); no HTML is ever injected |
| Cache and metadata | `private, no-store`; `force-dynamic`; noindex; no inquiry data in the page title or metadata |
| Print | The print stylesheet only hides chrome; there is no export file, URL or storage, so there is nothing to expose or leave behind |

## Open items
No rate limit on the read; cancel is limited (30 / 10 minutes). When quotations, messages, attachments or orders are added, the contracts in the other `PAGE_28_*` notes (ownership through the inquiry for every related record, signed short-lived file access, concurrent-selection protection) must be implemented and tested before any control appears.
