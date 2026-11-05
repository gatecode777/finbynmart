# Page 31 — Invoice access rules

Status: **BLOCKED.** There is no invoice model, numbering, generation, PDF or private invoice store. The order list has no invoice column and no download action; no invoice count is shown; `capabilities.invoices = false`. No fake invoice is generated and none is claimed.

Rules for a future invoice module (from the PRD, to be kept): download only through an authenticated route that checks buyer session, order ownership and that the invoice belongs to the order; private storage with short-lived access or an authenticated stream (never a permanent public URL); `Content-Disposition: attachment`, `nosniff`; keep every invoice version; exclude internal notes; mark an invoice available only after it was persisted. The existing buyer-document store (`BUYER_DOCS_DIR`) shows the storage pattern.
