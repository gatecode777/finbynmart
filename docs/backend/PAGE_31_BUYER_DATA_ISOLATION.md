# Page 31 — Buyer data isolation

1. **Identity from the session only.** `requireBuyerApi` / `requireBuyerPage` / `buyerGuard` take the user from the signed cookie (with `sessionVersion` revocation and the suspended-account check). No route reads a `buyerId` or `userId` from a URL, query or body; test B-03 sends them and they are ignored.
2. **Every query starts from `{ buyerId }`.** List, summary, facets, details, the cancellation request and the export all filter on the session's buyer in the database query itself, not after loading. Facets (suppliers, currencies) are grouped from the buyer's own rows.
3. **One answer for "not yours".** Another buyer's reference, an unknown reference and a malformed reference return the same 404 body (B-02); pages render the site's 404 (B-06, H-18).
4. **Writes on foreign orders change nothing** (B-04 compares the stored document before and after).
5. **Mass assignment:** the cancellation body refuses unknown fields (status, buyerId); a buyer cannot edit or delete an order (DELETE, PUT, PATCH are not exported: 405, E-08).
6. **Allow-listed DTOs.** Rows, details and the CSV are built field by field: no buyer id, internal ids, expected-sort value, e-mail or phone (C-16, E-06, G-03).
7. **Exports are scoped** to the buyer (B-05) and logged.
8. **Private responses:** `private, no-store`; pages are `noindex` and carry no order data in metadata.
9. Suppliers get 403 and anonymous requests 401 on every route (A-01 to A-05).
10. Future payment, shipment and invoice routes must repeat the same ownership check through the parent order; none exists today.
