# Page 35 — Buyer data isolation

1. **Identity from the session only:** `buyerGuard` / `requireBuyerPage` / `requireBuyerApi` (signed cookie, session-version revocation, suspended check). A `userId` or `buyerId` in a body or query is ignored (B-08).
2. **Every query is scoped:** the list, the details, remove, clear and the slot logic all use `{ userId }` from the session; another buyer's list cannot be read or changed. B removing a product only in A's list reports `removed:false` and A keeps it (C-02); B's list is only B's (C-01).
3. **Nothing client-supplied becomes data:** only a product key is accepted, validated against the catalogue (`resolveProduct`); prices, names, specifications, supplier verification and category are always read from the catalogue; raw documents and query operators are never accepted.
4. **A product's visibility is re-checked on every load:** a product that left the catalogue is shown as "no longer available" with only its saved name and no link, and no restricted detail; it can only be removed.
5. **Selection is not authority:** adding is limited to four by a database constraint, not by the client.
6. Responses are `private, no-store`; the page is `noindex` and carries no product or buyer data in metadata; suppliers get 403 and anonymous requests 401 on everything but the key list (A-01 to A-05).
7. **Add to Inquiry** is a plain link to the existing inquiry form: no inquiry is created by comparing, and the form re-resolves the buyer, the supplier and the product itself.
