# Page 30 — Quotation Details & Comparison: pre-build audit

Audit date: 2026-11-04, before any Page 29/30 code was written. Method: search of `src/`, `docs/` and the MongoDB collection list for anything quotation-related. Nothing from earlier quotation PRDs was assumed to exist.

## What existed

| Area | Finding |
|---|---|
| Quotation collection / model | **None.** No `quotations` collection, no type, no service. |
| Quotation routes or pages | **None.** `/buyer/quotations*` and `/api/buyer/quotations*` did not exist; the sidebar item "Quotations" was a non-link marked "Soon". |
| Supplier-side workflow | **None.** There is no supplier dashboard, no way for a supplier to reply to an inquiry or to create a quotation. |
| Versioning / revision | None. |
| Messaging | None (Page 28 already says so). |
| Orders / payments | None. No order, payment or invoice collection. |
| Attachments | Buyer document upload exists for the profile only (`BUYER_DOCS_DIR`); there is no quotation attachment store and no download route. |
| Notifications | A buyer notification centre exists (Page 26); there is no supplier notification channel at all. |
| Inquiries | `inquiries` collection with `statusHistory`, references `FBM-INQ-XXXXXXXX`, buyer-scoped reads (Page 27/28). Only NEW and CANCELLED are ever written; REPLIED/QUOTED are reserved and never set. |
| Auth / guards | `requireBuyerPage`, `requireBuyerApi`, `buyerGuard`, session-version revocation, rate limiter: all reusable. |
| Shared UI | Modal/ConfirmDialog, Toast, buyer shell, inquiry list/detail styles: reusable. |
| Page 29 (My Quotations) | Its PRD never arrived; only the reference image exists. Built from the image because it is the entry point of Page 30. |

## Decision

The PRD says to mark a feature BLOCKED when the quotation engine, versioning, messaging or order infrastructure is unavailable, and never to fabricate quotations. The standing owner rule says to build the backend together with the page. Both are satisfied by building the **buyer side** of the quotation module (read, list, compare, accept, reject, request revision) against a real `quotations` collection, and leaving everything that needs another actor BLOCKED:

| Feature | Status | Reason |
|---|---|---|
| View quotation, price breakdown, terms, snapshot | Built | Real collection and exact decimal math. |
| Version history and differences | Built (read) | Versions are separate documents of one reference; nothing creates a new version yet. |
| Compare 2–4 quotations of one inquiry | Built | |
| Accept / Reject | Built | Records the buyer decision only. |
| Request revision | Built | Saved with the version; **the supplier is not notified**. |
| Print | Built | Browser print stylesheet. |
| PDF export | **BLOCKED** | No PDF generator in the project and no dependency may be added without need; browser "Save as PDF" is the honest route. |
| Quotation creation by a supplier / revision reply | **BLOCKED** | No supplier workflow. Quotations can only be inserted by a future supplier module (or by the test suite). |
| Supplier notification of a decision or request | **BLOCKED** | No mechanism; every response says `supplierNotified: false`. |
| Messages with the supplier | **BLOCKED** | No messaging module. |
| Attachment download | **BLOCKED** | No attachment store; names and sizes are listed, no link is offered. |
| Order creation after acceptance | **BLOCKED** | No order module; the UI and API say "order processing is not available yet". |

Consequence: in normal use every buyer sees "No Quotations Yet" with the reason, because no supplier can send one. The pages are verified with quotations inserted directly into the throwaway database.
