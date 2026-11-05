# Page 34 — Buyer data isolation

1. **Identity from the session only.** `requireBuyerApi` / `requireBuyerPage` / `buyerGuard` (signed cookie, session-version revocation, suspended check). No route reads a `buyerId` / `userId` from a URL, query or body (B-02).
2. **Every query is scoped to the buyer in the database call:** the list and summary read `{ userId }`; bulk removal and Clear All delete with `{ userId, … }`; comparison is checked against the buyer's own saved rows. Another buyer's relationship cannot be reached.
3. **Bulk and compare cannot reach other buyers' data:** B's bulk removal of A's suppliers removes nothing and reports them as not saved (B-04); B comparing A's suppliers is 404 (B-05, B-06); B's single removal through the shared route reports `removed:false` and A keeps the row (B-03).
4. **Selection is not authority:** the server re-validates every key (pattern, count ≤ 20) and re-reads the buyer's saved list; client selection state is never trusted.
5. **A bookmark does not bypass availability:** contact, profile and compare actions read the live catalogue; a supplier that left offers none.
6. **Allow-listed output:** no user id, no contact fields, no research rating, no private supplier data (C-05).
7. **Responses are `private, no-store`;** pages are `noindex` with no supplier data in metadata.
8. Suppliers get 403, anonymous requests 401, on every route (A-01 to A-04).
