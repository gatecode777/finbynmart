# Page 34 — Saved suppliers API

Buyer session required (401 without, 403 for a supplier, 401 for a suspended or revoked session); every response `Cache-Control: private, no-store`; the buyer always comes from the session (a `buyerId` parameter is ignored). Code: `src/app/api/buyer/saved-suppliers/**`, `src/lib/wishlist/`.

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/buyer/saved-suppliers?q&category&state&city&type&verification&sort&page&limit` | The buyer's saved suppliers with live public facts, 12 a page (max 48) | 400 on any invalid parameter. `verification`: verified, unverified (pending / rejected do not exist). `sort`: recent, oldest, name, name-desc, products, categories (no rating sort). |
| `GET /api/buyer/saved-suppliers/summary` | The five numbers (`totalSaved`, `verified`, `active`, `categories`, `states`) and the filter choices (categories, states, cities, types, verification counts) | All from the buyer's own saved suppliers and the live catalogue. No country number. |
| `POST /api/buyer/saved-suppliers/bulk-remove` `{supplierIds: [1..20]}` | Removes the buyer's own bookmarks to those suppliers | `{removedCount, removed[], notSaved[]}`: the real outcome per supplier. Invalid key, empty, non-list or more than 20: 400 before anything is touched. Rate limit 30 / 10 min. |
| `DELETE /api/buyer/saved-suppliers` `{confirm: true}` | Clears the buyer's own saved list | `{removed}`; 400 without the explicit confirmation; logged. Rate limit 10 / 10 min. |
| `POST /api/buyer/saved-suppliers/compare` `{supplierIds: [2..4]}` | Side by side, from the live catalogue | Only the buyer's own saved and still-listed suppliers; anything else is one 404. Changes nothing. Rate limit 120 / 10 min. |

**Save one / remove one are NOT duplicated here.** The existing shared routes serve every entry point (supplier cards, profile, this page): `GET|POST /api/buyer/wishlist/suppliers`, `DELETE /api/buyer/wishlist/suppliers/{supplierId}` (60 requests / 10 min, cap 409 at 500). The PRD's per-page save routes would have been a second implementation of the same thing.

Contact and inquiry have no routes of their own: they open the existing inquiry form (`/inquiry/{supplierSlug}`). Pages: `/buyer/saved-suppliers`, `/buyer/compare-suppliers?ids=a,b`.
