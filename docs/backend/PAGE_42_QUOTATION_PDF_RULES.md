# Page 42 — quotation PDF / documents: BLOCKED

**Status: BLOCKED.** No PDF generation library, no quotation template and no private document storage for quotations exist in the project. The only document features are buyer company documents (`src/lib/buyer/documentStorage.ts`, private storage, owner download) and a browser Print button on the buyer's quotation page. Adding a PDF engine would be a new dependency and a new storage module, not an integration, so it was not started.

What the page does instead (stated on the page, never worded as a PDF):
- The quotation detail page has a **Print** button (`window.print()`, print stylesheet hides the controls). The browser's "Save as PDF" is the user's own; the app generates and stores no file.
- `capabilities.canDownloadPdf: false` with the reason in the API; no "Download PDF" button exists anywhere; `GET /api/supplier/quotations/[reference]/document` does not exist (404, test `E-13`).

Rules for whoever builds it (so the future module is consistent): render from the persisted version snapshot only (`totals()` / `breakdownRows()`), one document per version, private storage with random names, ownership re-checked at download (`supplierKey ∈ sellerKeys`) with an identical 404 for foreign/unknown, short-lived download access, no permanent public URL, no buyer contact data beyond the business name.
