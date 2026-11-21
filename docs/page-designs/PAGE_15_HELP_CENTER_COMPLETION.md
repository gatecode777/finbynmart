# Page 15 — Help Center & FAQs completion

Canonical route: `/help` (tracker Page 15; footer "Help Center" and the announcement bar already link it). `/faqs` (footer "FAQs", tracker alias) permanently redirects (308) to `/help`. Both used to be served by the generic "This page isn't published yet" template (`src/app/[page]/page.tsx`); that template is unchanged and still serves its other 17 destinations.

## Re-check of the audit findings (current source)
| Finding | Still true? | Action |
|---|---|---|
| `/help` and `/faqs` render the generic template | **No, stale**: a real page was built earlier (this document's first version) | Verified, then reworked to the single content source below |
| FAQ content in `src/lib/support/faq.ts`, channels in `channels.ts` | True | Now THE content source and THE channel source for the page |
| A second FAQ file existed | My first version had its own `src/lib/constants/helpContent.ts` with overlapping answers | Deleted; its answers were merged into `faq.ts` (one source) |
| `faq.ts` answers match current functionality | **Not all**: five answers were outdated | Corrected (see below) |

## Content source (one canonical, no duplicate text)
`src/lib/support/faq.ts` feeds the public Help Center, the buyer support page, the supplier support page and `GET /api/public/faqs`. Only `published: true` entries are shown. Every entry is public-safe (how-to text, nothing about any account, no secret; asserted by the unit test) because the public page and API already expose all published items. New: optional `links` (existing routes, used by the Help Center only; the API still returns only id/category/question/answer). Two FAQ categories were added to `FAQ_CATEGORIES` (`ticketRules.ts`, FAQ use only): Requirements & Matching, Supplier Account & Products. 26 published entries in 9 categories (Account & Registration, Products, Suppliers, Inquiries & RFQs, Quotations, Orders, Requirements & Matching, Supplier Account & Products, Technical Support).

Outdated answers corrected in the shared source (they were also shown on the buyer and supplier support pages and in the public API):
| Entry | Was | Now (evidence) |
|---|---|---|
| `inq-send` | "Suppliers are not notified automatically yet" | supplier sees it in its own portal; reply not guaranteed (supplier in-app notices exist; no e-mail) |
| `quo-accept` | "does not create an order … or notify the supplier" | records the decision; an order exists only after the buyer explicitly confirms one (`orders/orderConfirmation.ts`); no payment or shipping |
| `ord-where` | "Orders cannot be created through the site yet" | an order exists only after confirming one from an accepted quotation |
| `ord-cancel` | "supplier is not notified automatically yet" | notification claim removed (not verified either way) |
| `tech-ticket` | "No support team replies through this site yet" | any reply appears on the ticket; no reply or response time promised (a staff reply path, `support.manage`, exists) |
| `acc-company` | "Documents are not reviewed or verified yet" | "Uploading documents does not verify a company" (verification is a separate admin review, Page 53) |
Merged duplicates: contact a supplier (`inq-send`), responses (`inq-track`), quotations (`quo-where`), contact Finbyn Mart (`tech-contact`), password and account (`acc-password`).

## Page behaviour
Breadcrumb, h1 "Help Center & FAQs", intro, search ("Search help topics"), topic buttons (the categories that really have entries, with counts, `aria-pressed`), a polite live status, "Reset search and topic", native `<details>/<summary>` accordions (keyboard Enter/Space, expanded state, reduced-motion respected), links under an answer. Filtering is local (`src/lib/support/faqSearch.ts`): trimmed, normalised, lower-cased, 80 characters, every word must appear in question or answer as plain text; topic and search combine; an unknown topic matches nothing. Every answer is in the server-rendered HTML, so they read without JavaScript. Nothing is sent anywhere or stored.

## Channel visibility rules
Through the existing `getSupportChannels()`: **Contact Us** (`/contact-us`) always; **e-mail** and **phone** only when `SUPPORT_EMAIL` / `SUPPORT_PHONE` are configured and pass validation (shown exactly as configured, never any other variable); live chat is never offered (the service reports it unavailable) and the ticket anchor channel is not used on this public page. Two labelled portal links, **Buyer support tickets** (`/buyer/support`) and **Supplier support tickets** (`/supplier/support`), say "you will be asked to sign in first" and keep the existing guards, which send a signed-out visitor to sign-in with the page kept (shared `safeReturnPath`). Nothing implies a signed-out visitor can submit directly. The page is `force-dynamic` (no database) so the runtime environment decides channel visibility, not the build.

## Files changed
`src/lib/support/faq.ts` (content, links, corrections), `src/lib/support/faqSearch.ts` (new), `src/lib/support/ticketRules.ts` (two FAQ categories), `src/components/help/HelpFaq/HelpFaq.tsx` (+ css), `src/app/help/page.tsx` (+ `help.module.css`), `src/app/faqs/page.tsx` (alias). Deleted: `src/lib/constants/helpContent.ts`. Tests: `97-help-center-unit-test.mjs` (18), `98-help-center-browser-check.mjs` (40); `36-support-rules-unit-test.mjs` (29) re-run.

## Tests actually run (production build; no database needed or used: MongoDB deliberately unreachable)
- tsc, lint, production build clean; all 60 unit scripts pass.
- Unit 97: only published entries shown; filter rules (case, whitespace, AND words, answer-only match, topic + search, unknown topic, hostile input); counts match; links resolve to existing pages; no unsupported promise; outdated statements gone; critical accuracy statements present; no private or secret text; one source; static and accessible contract; channels never invented; generic template unchanged.
- Browser/HTTP 98 (two servers: one with nothing configured, one with a TEST e-mail in its process environment only): 200 signed out; `/faqs` 308 to `/help`; header and footer link `/help`; the Help shows exactly the entries of `/api/public/faqs` (no extra fields); `/blog`, `/track-inquiry`, `/refund-policy` still show the generic template; Contact Us and both portal links present; no mailto on the unconfigured server, a mailto only on the configured one; no secret or "Online" in the HTML; search, whitespace, multi-word, no-result, Reset, topic, topic+search, markup as text, keyboard Enter/Space, answer links, focus outline; no write, no external request, no console error; 320/360/390/430/768/1024/1280/1440 and landscape 844x390 / 640x360 without overflow, clipping or horizontal slider; 200% zoom simulation; contrast 8.9 / 12.3 / 6.2; heading order h1 then h2. Screenshots: `docs/page-reports/screenshots/15-help-center-320x640.png`, `-1440x900.png`, `-844x390.png`, `-search-1280.png`.

## Not verified / content approvals needed
The buyer and supplier support pages (signed-in) were not re-rendered in a browser after the shared FAQ changed (they compile and read the same function; their accordions show the new categories). Destination workflows behind the links were not exercised. No screen-reader, Firefox/Safari or real-device run. Wording is draft and needs business approval: the e-mail-delivery conditional text, "guest inquiries allowed", the claim that a supplier "sees it in its own portal", and the "reply on the ticket" wording (confirm the staff reply path is operated before launch).
