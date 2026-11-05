# Profile completion rules

Code: `computeCompletion()` in `src/lib/buyer/profileRules.ts` (pure, 33 unit tests). The percentage is computed on the server from stored state at every request; nothing is hard-coded.

| Item | Weight | Counts only when |
|---|---:|---|
| Full name | 10 | at least 2 characters |
| Designation | 10 | filled in |
| Primary email verified | 15 | `emailVerified` is true (a filled email earns nothing) |
| Mobile verified | 15 | `phoneVerified` is true (currently unreachable: no SMS service) |
| Company added | 15 | a company record exists |
| Business type | 10 | the company has one |
| Company city, state and PIN | 10 | all three present |
| At least one document | 15 | an active document exists (any status) |
| **Total** | **100** | |

Not counted: business verification (a separate status), the company description or website (optional text earns no reward), and any sensitive identifier (GSTIN, PAN are never asked for in order to score). A new buyer is therefore 10%. With mobile verification impossible today, the maximum reachable percentage is 85% until an SMS provider exists; the page lists the missing items with the tab that fixes each.

Verified by `U-27` to `U-33` (unit), `F-01` to `F-03` (new buyer 10%; then 70, 85, 100 as designation, company, document, confirmed email and confirmed mobile are added) and `I-04` in the browser.
