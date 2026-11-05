# Page 34 — Counting rules

One definition, in the header of `src/lib/wishlist/savedSuppliersRules.ts`, used by the cards, the filters and the API.

| Number | Rule |
|---|---|
| Total Saved | Every saved relationship of the buyer (unique by supplier), including a supplier that has since left the catalogue. Capped at 500. |
| Verified | Saved suppliers still in the catalogue whose own record says "verified". Never inferred. |
| Active | Saved suppliers still in the catalogue (publicly listed, so they can be viewed and contacted). Separate from Verified. |
| Product Categories | Distinct product categories across the active saved suppliers: a category shared by two suppliers counts once; a supplier in two categories contributes two. |
| States | Distinct states of the active saved suppliers. **Replaces the PRD's "Countries"**: no supplier record stores a country and none is inferred. |
| Per-supplier product count | The supplier's products in the catalogue (the same count the supplier's own page uses), computed from the seed, never by loading products per request. `null` (shown as nothing) for an unavailable supplier, never a fake 0. |
| Per-supplier category count | Distinct categories of the supplier's products (`categoryCount`, added to the public supplier DTO). The card lists at most three names and "+N more". |

A supplier under several categories appears under each category filter yet counts once in every total. Facet counts are suppliers per category / state / city / type. Tests D-01 to D-04, C-10, C-11, unit C-01.
