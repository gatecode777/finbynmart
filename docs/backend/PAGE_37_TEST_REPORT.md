# Page 37 — Test report

Date: 2026-11-05. Production build in `.next-audit`, served on port 3100; database `finbynmart_test` (dropped afterwards); headless Chrome via `puppeteer-core`. Support-side records (support messages, internal notes, status events) were **inserted directly into the database**, because no support side exists; they prove the buyer's side reads them correctly and hides what it must.

| Suite | Result |
|---|---|
| `37-conversation-rules-unit-test.mjs` (`node --import ./docs/page-reports/tools/alias-register.mjs ...`) | 25/25 |
| `37-buyer-ticket-details-test.mjs` | **92/92** (final run, fresh database) |
| `36-buyer-support-test.mjs` (updated for the new ticket page and contract) | 75/75 (one earlier run: 74/75, a one-off 718 ms spike on the categories route; passed on rerun) |
| `36-support-rules-unit-test.mjs` | 29/29 |
| `npx tsc --noEmit`, `npm run lint`, production build | clean / passes (see the final report) |

Integration groups: **A** access · **B** details, ownership, wrong methods · **C** conversation (internal notes excluded, 1,000-message paging in 20 pages with the original at the start, same-millisecond ties, bad cursors) · **D** replies (validation, forged fields, duplicate and simultaneous sends, status rules, waiting → in progress, files, rejections with no orphan files, rate limit) · **E** files (grouping, paging, owner download, foreign and internal 404) · **F** timeline (merge, paging equals one big page, internal event excluded, retries) · **G** related records (live read, ownership change, draft quotation, missing product) · **H** reopen (validation, simultaneous, history kept, 30-day window, 3 reopenings, closed tickets, rate limit) · **I** feedback (validation, once per ticket, unique index, timeline, closed tickets, rate limit, no private fields) · **K** browser (page, tabs, keyboard, URL state, draft kept, send with a file and double click, long conversation, HTML as text, feedback and reopen through the real forms, Back keeps filters, 404) · **R** responsive and accessibility structure · **P** performance and explain plans.

## Defects found by the tests and fixed
- The ticket page crashed on first load: a constant exported from a client component was read by the server page (`TICKET_TABS.find is not a function`); the tab keys moved to the shared rules file.
- The duplicate-send lookup used a partial index MongoDB cannot use for equality: it read all of a ticket's messages (10,000) on every reply. Index filter changed to `$exists`; an index for the file lookup added; the check now asserts one document.
- A leftover `storage` field name tripped the Page 36 "no internal fields" check; renamed `canAttach`, and the Attach button is disabled with a sentence when uploads are off.
- Screenshot review: the ticket ID wrapped badly in the summary and the "no support reply yet" notice showed although a support message was visible; both fixed.
- Test-side corrections: data seeded before the ticket existed, parallel writes hitting the write rate limits, a page count (20, not 21), a wrong focus-return method.

## Not run
Lighthouse, an automated contrast tool, screen readers, Firefox, Safari, real devices, landscape orientation, real browser zoom (viewport-width equivalents were tested), the support-inbox e-mail path (not configured), WebSocket or push delivery (does not exist), tests against a hosted/production database, load tests. The regression suites for Pages 22–35 were not re-run for this change (it touches only the support module); Page 36's were.
