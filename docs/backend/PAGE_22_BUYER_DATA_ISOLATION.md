# Buyer data isolation

- Identity: `requireBuyerApi()` and `requireBuyerPage()` (`src/lib/auth/guards.ts`) read the signed session cookie; the account must be ACTIVE and role buyer. Nothing in the query string, body or headers names the buyer (tests B-03, B-04: `buyerId`, `userId`, `buyer` parameters and an `x-buyer-id` header are ignored).
- Every data function takes `buyerId` from the guard and filters by it in the database query: inquiries `{ buyerId }`, saved items `{ userId }`, user lookup by `_id`. The page and the API call the same service, so the rule is in the service layer, not only in a layout.
- Guests: guest inquiries have no `buyerId` and cannot match.
- Responses are `Cache-Control: private, no-store` (also set for `/buyer/*` and `/api/buyer/*` in `next.config.ts`); there is no shared cache of dashboard data.
- Output is a minimal DTO: no email, phone, hash, ids of accounts or inquiry message text (B-10, G-02).
- Tested: B-01 to B-10 (two buyers with distinct data and secrets; neither buyer's answer contains the other's references, messages or suppliers; replaying a cookie shows only that cookie's data; a new buyer sees only zeros), A-01 to A-08 (401, 403, suspended, forged, expired, redirect, supplier page).
- Not applicable yet: quotations, orders, cart and notifications of another buyer cannot be reached because no such endpoint exists.
