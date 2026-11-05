# Page 34 — Supplier verification rules

There is **no verification workflow**: no records, evidence, reviewer states or documents for suppliers. The only signal is the `verified` flag on **sample** supplier records (`SupplierDetail.verificationStatus`), which is placeholder content documented in `docs/MISSING_ASSETS.md`.

Rules the page follows:
- **Verified** = the supplier's own record says "verified". Nothing is derived from an e-mail, phone, GSTIN, CIN, logo, name or a complete profile.
- **Catalogue sellers (1,062) are never verified.** They show "Not verified".
- **Not verified** is the plain state of every other available supplier. A supplier that left the catalogue is neither (it is unavailable) and is not counted in either facet.
- **Pending and Rejected are not offered** as filters or badges: nothing can be in those states, and showing them would invent a workflow. The API refuses `verification=pending` and `verification=rejected` (400).
- The badge is a word with an icon ("Verified supplier" / "Not verified"), never colour alone; the Verified card counts only available suppliers whose record says so; verification is kept separate from "Active" (a supplier can be either, both or neither).
- A DEMO/sample supplier is never given a verified badge unless its own record carries one; the page does not claim the platform checked anything.

Tests: C-04, C-12, D-01, D-03, unit Q-04.
