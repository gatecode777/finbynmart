# Page 30 (and 29) — Test report

Run: 2026-11-04, production build in `.next-audit`, `next start` on port 3100, throwaway database `finbynmart_test` (dropped afterwards). Quotations were inserted directly into that database because no supplier can create one.

## Results

| Suite | Result |
|---|---|
| `29-30-buyer-quotations-test.mjs` (API + browser + perf) | **102 / 102** (A access 6, B ownership 8, C list 11, D detail 13, E comparison 10, F decisions 21, G pages 26, R responsive 4, P performance 3) |
| `30-quotation-rules-unit-test.mjs` (money, status, validation, compatibility) | 26 / 26 |
| Regression: Page 22 dashboard (sidebar item no longer "Soon") | 96 / 96 |
| Regression: Pages 27–28 inquiries (details now show real quotations; three expectations updated) | 98 / 98 (performance group skipped) |
| Regression: Page 23 profile 102, Page 24 addresses 85, Pages 25–26 settings 91, Saved Products 40 | all passed (performance groups skipped where the suite allows) |
| `npx tsc --noEmit`, `npm run lint`, production build | clean |

## What the suite covers

Access (anonymous, supplier, suspended, forged); ownership and enumeration; list counts, tabs, search, sort, paging, bad filters; detail DTO, exact price math (₹7,92,360.00 worked example), "Not specified" tax, "Not Provided" terms, versions and differences, capabilities per status; comparison (compatibility warnings, limits, no ranking words, nothing changes); decisions (confirmation, stale, expired, withdrawn, double accept, reasons, duplicate revision, races); pages in a real browser (KPIs, tabs, search, sort, selection and compare link, details, dialogs, accept/reject/revision through the UI, print view, inquiry-details integration, empty state); 16 widths (320–2560) on list, details and a four-way comparison for horizontal overflow, clipped headings and console errors; dialog focus and Escape.

## Not tested (do not assume)

Firefox and Safari; real devices; landscape and browser zoom 80–200%; screen readers; automated contrast and axe checks; Lighthouse; visual regression against the reference images beyond screenshots taken at 1440 and 390; the 30/10-minute decision rate limit itself; very large quotation volumes; PDF export (BLOCKED); messaging, attachment download, orders, supplier notification (BLOCKED, no modules); a real supplier creating quotations or versions (BLOCKED).

## Defects found while testing (fixed)

1. Detail heading (`FBM-QT-… V2 (current)`) was clipped at 320 px: now wraps (R-01).
2. Test-only: references containing I, L, O or U do not match the reference pattern; initial test data and a decision-count assumption were wrong; one test waited on the word "Rejected" that also appears inside the dialog. A stale test server (HTML naming a different webpack file than the disk) once made the page unhydrated: not an app defect, fixed by restarting the server without a rebuild.
