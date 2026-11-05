# Page 24 — Address Book: audit before implementation

Checked against the repository on 2026-11-03.

## What existed
| Area | Finding |
|---|---|
| Address storage | None. No `addresses` collection, no service, no route, no page. Searched `src/` and `docs/` for address models. |
| Where addresses appear today | (1) Page 13 inquiry form: one free-text "delivery location" field, stored as `deliveryLocation.text` on the inquiry; (2) the company record (Page 23) holds a single registered/business location; (3) `profileRules.ts` already has `COUNTRIES` and `checkPostalCode` (India: six digits, not starting with 0; other countries by their own rules). |
| Buyer identity | `requireBuyerPage` / `buyerGuard` from the Page 22–23 work: server session, ACTIVE account, buyer role. |
| Orders, quotations, checkout | Do not exist, so nothing can reference an address id and there is nothing to snapshot yet. |
| Tracker | No Address Book row (baseline has none) → new ID 99. |

## Decisions
1. **One new collection**, `buyer_addresses` (a buyer has many addresses; embedding in `users` would make defaults and concurrent edits harder). Fields in `PAGE_24_ADDRESS_DATA_MODEL.md`.
2. **Hard delete.** No other record references an address id, and inquiries keep their own text, so deletion cannot break history. `isReferencedByActiveRecord` is the single hook to change when orders exist (it returns false today).
3. **Defaults enforced by the database**, not only by code: two partial unique indexes. Changes run in a transaction.
4. **Reuse**: validation helpers (name, company, phone, postal code), `buyerGuard`, `recordProfileEvent`, rate limiter, shared dialog styles from the profile page.
5. **Cap of 50 addresses per buyer** (a policy limit that also bounds every query).

## Gaps and risks found
- No address verification service: addresses are never marked verified.
- No role enforcement beyond the buyer guard exists elsewhere in the project (see security audit); this page uses the same server-side guard as Pages 22–23.
- Production needs the same MongoDB Atlas as the rest of the buyer data; nothing else is required.
