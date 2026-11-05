# Page 28 — Buyer Inquiry Details: implementation report

**Status:** The inquiry-details workspace is implemented and verified on the throwaway database; QA not complete. **BLOCKED (no module exists, so nothing is shown or faked):** supplier responses, quotations and quotation history/compare, messaging, attachments, revision requests, quotation selection and orders, PDF export (print is provided), multi-supplier counts, target price and required-by date (not collected by the inquiry form).

**Audit:** `docs/backend/PAGE_28_INQUIRY_DETAILS_AUDIT.md` (verified in the code that only inquiries exist).
**Frontend:** `src/app/buyer/inquiries/[reference]/page.tsx` (+ `error.tsx`); `src/components/buyer/inquiries/detail/*` (view, header actions and bottom bar, accessible tabs, styles incl. print); shell print rules; reuse of `InquiryTimeline`, `StatusPill`, the shared Modal/ConfirmDialog and Toast.
**Backend:** `src/lib/inquiries/buyerDetail.ts` (extends the Page 14 builder `toConfirmationDto`), `GET /api/buyer/inquiries/[id]?view=detail`, cancel by reference. No new collection, index or endpoint beyond Page 27's.
**Behaviour:** reference-keyed, ownership re-checked on every request, identical 404 for foreign / unknown / malformed / guest; timeline only from recorded history; honest "not connected" states; cancel with the shared dialog and a server-confirmed toast; print stylesheet; capability flags literally false for what does not exist.
**Results:** details checks M-01 to M-15 pass (suite 100/100 with performance on the final build), responsive at 16 widths, regression suites for Pages 13, 14, 22–26 pass. Detail API p95 99–125 ms over three runs from 100 to 20,000 inquiries; cancel p95 140–180 ms.

**Gaps:** Lighthouse, contrast, Firefox/Safari, landscape, zoom and screen-reader testing not run; the details page's render time not measured; all blocked features above.
**Docs:** page design and 12 notes `docs/backend/PAGE_28_*`, this report. **Tracker:** row 27 updated.
