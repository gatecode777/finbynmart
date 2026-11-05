# Page 35 — Supplier data rules

Shown per product, read live from the catalogue: supplier name (profile link when a profile exists), business location (city, state), business type (sample suppliers only), verification as the supplier's own record says ("Verified" only where it does; catalogue sellers are "Not verified"), and the Rating row only for sample listings that carry one (placeholder data, flagged in `docs/MISSING_ASSETS.md`).

Not shown, because the data does not exist: supplier logos, genuine supplier ratings and reviews, supplier product counts and categories (those are on Saved Suppliers), certifications, warranties, years in business. Never shown or loaded: owner or contact details, e-mail, phone, address, GSTIN / PAN / CIN, documents, internal notes.

Verification is not inferred from anything else (no e-mail, phone, GSTIN, logo or complete profile counts) and is kept separate from the product's own facts. A product whose supplier has no public profile shows the supplier's name without a link and offers no Add to Inquiry. Tests: D-02, D-16, G-01e.
