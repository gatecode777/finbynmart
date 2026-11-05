# Page 34 — Contact and inquiry integration

**Contact Supplier** — built as a link to the existing inquiry form `/inquiry/{supplierSlug}`. There is no buyer-supplier messaging module, so no conversation exists to open. The link carries the supplier context in the path; the form (Page 13) resolves the buyer from the session, validates, rate-limits and stores the inquiry, and reveals no private contact detail. It is not offered for a supplier that has left the catalogue (no link, no button). Messaging is **BLOCKED**.

**Add to Inquiry** — enabled with exactly **one** selected available supplier: it opens that supplier's inquiry form. With two or more selected it is disabled and the page says an inquiry goes to one supplier at a time. **Multi-supplier inquiry is BLOCKED**: the inquiry system stores one supplier per inquiry and has no confirmation or routing for several. Selecting suppliers never sends anything; saving a supplier is not an inquiry; nothing notifies a supplier until the buyer submits the form.

No second communication system and no new inquiry route was created. Tests: H-02, H-07, H-08.
