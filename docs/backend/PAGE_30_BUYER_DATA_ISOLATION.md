# Page 30 — Buyer data isolation

1. **Identity from the session only.** `requireBuyerApi` / `requireBuyerPage` / `buyerGuard` take the user from the signed cookie (with `sessionVersion` revocation and suspended-account check). No route reads a `buyerId`, `userId` or similar from the URL or body; test B-04 sends them and they are ignored.
2. **Two ownership checks.** Every quotation carries `buyerId` (copied from its inquiry) and every read filters on it; detail, decisions and comparison additionally re-read the parent inquiry with the same `buyerId`. A quotation whose inquiry is not the buyer's is unreachable.
3. **One answer for "not yours".** Another buyer's reference, an unknown reference, a draft, a malformed reference and a bad `?version` return the same 404 with the same body (test B-02); pages render the site's 404 (B-08). Comparison with any foreign reference is a 404 for the whole request (B-05, B-06).
4. **Writes on foreign quotations change nothing** (B-07 compares the stored documents before and after).
5. **Drafts are never visible**, not even to their own buyer (B-03); counts exclude them.
6. **Allow-listed DTOs.** List rows, detail and comparison are built field by field: no buyer id, internal ids, e-mail, phone, consent records, event actors' identities or storage paths (C-10, D-10).
7. **Supplier contact fields are never shown** (project rule); the supplier appears by name, location and a link to its public page; "verified" only if the supplier's own record says so.
8. **Responses are `private, no-store`**; pages carry `noindex`.
9. Suppliers get 403 on every buyer route; anonymous requests get 401 (pages redirect to sign-in) (A-01 to A-06).
