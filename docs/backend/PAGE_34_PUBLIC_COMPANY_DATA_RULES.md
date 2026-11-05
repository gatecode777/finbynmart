# Page 34 — Public company data rules

Shown (only what the supplier record holds, read live): display name, initials badge (a neutral fallback: no logo exists), city and state, supplier type (sample suppliers only), a public description (only the hand-written sample profile has one), up to three category names and the true category count, public product count, member-since year, verification as the record says, the saved date, and links to the public profile, the supplier's products and the inquiry form.

**Never shown, never loaded:** owner or contact names, e-mail, phone, address, GSTIN / PAN / CIN, documents, internal notes, order counts and the research `rating` column. There is **no logo, no banner, no rating or review, no website, no country and no response statistic** because the data holds none; the page does not draw a placeholder for them or use a product photo as a logo. Test C-05 scans the whole list answer for contact, rating, review, logo and banner fields.

Sample supplier content is placeholder data flagged in `docs/MISSING_ASSETS.md`; catalogue sellers are fictional research sellers. Neither is presented as a registered real company.

If a future company repository adds media or reviews, the facts function (`computeFacts` in `src/lib/wishlist/savedSuppliers.ts`) is the single place to extend; the PRD's rules still apply (exact company-to-image relationship, genuine reviews only, original assets for demo records).
