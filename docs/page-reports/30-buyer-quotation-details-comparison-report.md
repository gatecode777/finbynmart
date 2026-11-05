# Page 30 report — Buyer Quotation Details & Comparison (with Page 29, My Quotations)

Date: 2026-11-04. Routes: `/buyer/quotations`, `/buyer/quotations/[reference]`, `/buyer/quotations/compare`. Spec: `docs/page-designs/30-buyer-quotation-details-comparison.md`.

## What was found first

No quotation module existed (no collection, routes, pages, supplier workflow, versioning, messaging, orders or attachment store). Audit: `docs/backend/PAGE_30_QUOTATION_DETAILS_AUDIT.md`. Page 29's PRD never arrived; its list was built from the reference image only.

## What was built

Backend: `src/lib/quotations/` (`money.ts` exact BigInt math, `quotationRules.ts`, `service.ts`, `http.ts`), routes under `src/app/api/buyer/quotations/` (list, detail with versions, compare, accept, reject, revision-request), collection `quotations` with 5 indexes including the unique partial index that allows one accepted quotation per inquiry.
Frontend: `src/components/buyer/quotations/` (workspace, detail view, actions with dialogs, compare view, print button, status pill), three pages plus an error boundary for the detail page (no `loading.tsx`: the page can 404), sidebar Quotations link, and Page 28 integration (real quotation count and list on Inquiry Details; the empty tab says suppliers cannot send quotations yet).
Tests: `29-30-buyer-quotations-test.mjs` (102/102), `30-quotation-rules-unit-test.mjs` (26/26); regression suites for Pages 22, 23, 24, 25/26, 27/28 and Saved Products green (see `docs/backend/PAGE_30_TEST_REPORT.md`).

## Feature status

| Feature | Status |
|---|---|
| My Quotations list, tabs, search, sort, paging, selection | Implemented, tested (throwaway DB data) |
| Quotation details, exact breakdown, terms, snapshot | Implemented, tested |
| Version history and what changed | Implemented (read), tested; **new versions cannot be created** |
| Comparison (2–4, one inquiry, no ranking) | Implemented, tested |
| Accept / reject | Implemented, tested incl. races; records the decision only |
| Request revision | Implemented, tested; **supplier is not notified** |
| Print | Implemented; PDF export **BLOCKED** (use the browser's Save as PDF) |
| Messages, attachment download, order after acceptance, supplier notification, supplier creating quotations | **BLOCKED**: no module exists |

## Honest summary

In real use every buyer currently sees "No Quotations Yet", because there is no way for a supplier to send one. The buyer side is verified only against quotations inserted into the test database. Design and QA are not marked complete: no reference-image comparison beyond screenshots, no Firefox/Safari/device/zoom/landscape/screen-reader/Lighthouse runs.

Not committed: all changes are in the working tree. Cleanup done: throwaway database dropped, test server on port 3100 stopped, `tsconfig.json` reverted.
