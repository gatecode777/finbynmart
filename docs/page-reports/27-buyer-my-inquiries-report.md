# Page 27 — Buyer My Inquiries: implementation report

**Status:** Implemented and verified on the throwaway database; QA not complete. **BLOCKED:** linked quotations and supplier replies (no such modules, so Replied/Quoted can only ever be 0 today), real-time updates, a requirement title, supplier logos and verification marks, an Export action (shown in the reference, not in the PRD, nothing behind it), per-row "View Quotation".

**Audit:** `docs/backend/PAGE_27_BUYER_INQUIRIES_AUDIT.md`.
**Frontend:** `src/app/buyer/inquiries/page.tsx`; `src/components/buyer/inquiries/*` (workspace, `BuyerInquiryTable`, filters dialog, cancel dialog, status pill); shared `ui/Modal` (Modal, ConfirmDialog); `/account/inquiries` is a 308 redirect; sidebar, dashboard, confirmation page, notification and quick-action links point to `/buyer/inquiries`.
**Backend:** `src/lib/inquiries/buyerListRules.ts` (pure), `buyerList.ts`; extended `service.ts` (shared collection accessor, three indexes, cancel by reference), `dashboard.ts` (shared awaiting group); routes `GET /api/buyer/inquiries` (extended), `GET /api/buyer/inquiries/summary` (new), detail and cancel (role-checked).
**Schema:** no new collection. New fields on new product inquiries: `categoryKey`, `categoryName`. New indexes: `buyer_newest`, `buyer_status_newest`, `buyer_updated`.
**Status mapping, summary rules, filters, cancellation, isolation:** `PAGE_27_STATUS_MAPPING.md`, `PAGE_27_INQUIRY_FILTERS.md`, `PAGE_27_CANCELLATION_RULES.md`, `PAGE_27_BUYER_DATA_ISOLATION.md`.
**Results:** 28/28 unit, 100/100 browser and API with performance on the final build, Pages 13, 14, 22–26 re-run and passing. Over three full runs and from 100 to 20,000 inquiries: list p95 80–103 ms, summary 77–129, detail 99–125, cancel 140–180; the highest single values, search 301 ms at 10,000 and the last page 379 ms at 20,000, are within the targets but close. Query plans: index scans, no blocking sort.
**Decisions to know:** Create New Inquiry opens `/products` (an inquiry always goes to one supplier); category is saved when an inquiry is sent (earlier ones have none); no React Query (not in the project); Rejected added as a ninth tab.

**Gaps:** Lighthouse, contrast, Firefox/Safari, landscape, zoom, screen reader and concurrent-buyer tests not run; offset paging (slowest at the last page of a very large history); the redundant `{buyerId, createdAt}` index.
**Docs:** page design, 7 backend notes `PAGE_27_*`, this report. **Tracker:** row 26 updated.
