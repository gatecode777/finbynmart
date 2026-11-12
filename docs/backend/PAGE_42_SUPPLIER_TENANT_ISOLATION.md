# Page 42 — supplier tenant isolation

**Identity chain** (never from the client): session cookie → `getCurrentUser` → `requireSupplierPage/Api` (role `supplier`, company resolved from the account id, company `ACTIVE`) → `context.company.sellerKeys` → every query. `companyId`, `supplierId`, `supplierKey`, `sellerKeys`, `buyerId` in a query string or body are not read (test `C-05`, `C-06`).

**Enforcement inside the service**, not only the route (`src/lib/supplier/quotationService.ts`):
- list / summary / export: `supplierKey ∈ sellerKeys`, `isCurrent: true`; an empty `sellerKeys` returns an empty result before any query.
- detail / versions: `reference` AND `supplierKey ∈ sellerKeys`; the related inquiry is read only if it too is addressed to one of the company's sellers (an inquiry of another seller is never shown, `C-09`).
- withdraw: the lookup and the conditional `updateOne` both carry `supplierKey ∈ sellerKeys`.
- Unknown, malformed and another supplier's references give the **same** 404 body (`C-02`), so existence is not leaked; the pages return a real HTTP 404 (`I-05`).

**Buyer privacy:** the buyer is shown by registered business name only (or "Individual buyer"); no email, phone, name, address, private inquiry message or account field in any response, page or export (`D-22`, `E-07`, `G-03`).

**Verified** (126 checks, `42-supplier-quotations-test.mjs`): unauthenticated 401 on all six routes; a buyer gets 403 on all and a redirect to `/forbidden` on both pages; a suspended company 403; supplier A and B see only their own; A cannot read, version, withdraw or export B's quotations; a company with no linked seller sees nothing (and the page says why).

**Not covered (not built):** staff roles inside one company (one login per company today), company membership expiry, multi-role. When a membership table exists, `SupplierContext.permissions.manageQuotations` is the hook for withdraw/export.
