# Page 28 — Quotation integration

**BLOCKED: no quotation module exists.** There is no quotations collection, route, status or version, and QUOTED is never written. Consequently the page shows: the Quotations tab "No quotation ... Quotations are not connected yet", "Quotations Received: Not available yet", no quotation history, no compare, no revision request, no selection, and the list has no per-row "View Quotation". No sample quotation, price or supplier is shown anywhere. `quotation` in every list row is the literal `null`.

## Contract for when it is built
- Collection `quotations`, each with `inquiryId`, `supplierKey`, `version`, `status` (DRAFT, SENT, ACCEPTED, REJECTED, WITHDRAWN, EXPIRED), `currency`, unit price, offered quantity, MOQ, delivery timeline, payment terms (only if captured), `validUntil`, `createdAt`. Indexes `{inquiryId, createdAt}`, `{buyerId, status, createdAt}`, `{supplierKey, status, createdAt}`.
- The buyer lists only quotations whose `inquiryId` belongs to their own inquiry and whose status is SENT or later; DRAFT is never returned.
- Versions are new documents, never edits; the latest is marked, expired ones are shown as expired and not as active; amounts are shown in their own currency, never summed or converted, and no total is computed without real tax and shipping fields.
- Linking a SENT quotation moves the inquiry to QUOTED through the lifecycle and appends `statusHistory`.
- Quotation detail route (`/buyer/quotations/[id]`, tracker row 28) must re-check ownership through the inquiry.
- Then: add the list's View Quotation action, the Page 28 tab content, history and compare, and flip `capabilities.quotations`.
