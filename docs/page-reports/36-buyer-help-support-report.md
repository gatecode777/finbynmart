# Page 36 — Buyer Help & Support: implementation report

Date: 2026-11-05. Route `/buyer/support` (tracker ID 105) and the compact `/buyer/support/tickets/[ticketReference]` (ID 106, stand-in until the Page 37 PRD arrives). Buyer accounts only.

## What exists now
- **Backend:** `support_tickets` collection (7 indexes), `src/lib/support/` (rules, service, FAQ, channels), buyer API (summary, categories, related, list, create, detail, private attachment download) and public FAQ/channels APIs. Creation pipeline: session → rate limit (10/hour) → server validation (unknown fields refused) → idempotency lookup → related-record ownership → attachment content checks → private store → insert with reference retry → in-app notification → optional support-inbox e-mail.
- **UI:** summary cards, Raise a Support Ticket form (drag and drop, upload progress, related picker), My Support Tickets (table/cards, search, filters dialog, sorts, pagination, URL state), FAQ accordion, Other Ways to Get Help, ticket page.
- **Shared change:** the notification category `support` (always on); sidebar "Help & Support" now links to the page.
- **Also in this work (owner request):** `@vercel/speed-insights` installed and `<SpeedInsights />` added to the root layout.

## Audit findings (details: `docs/backend/PAGE_36_BUYER_SUPPORT_AUDIT.md`)
No ticket system, staff side, replies, chat, e-mail provider config, support contact details or FAQ source existed. Contact Us messages exist with a different reference shape and were left alone.

## BLOCKED / not available (shown honestly, not faked)
Support staff side (agents, assignment, status changes), ticket replies and the reply/reopen/close buttons, live chat, invoice and payment related records, ImageKit/external storage, admin-managed FAQs, malware scanning, support e-mail/phone/hours (appear only when configured; none is), the support-inbox alert (sent only if `SUPPORT_EMAIL` and an e-mail provider exist; untested path). The creation message says: no support team replies through this site yet.

## Tests
Unit 29/29; integration 75/75 (includes browser flows, 16 widths, 1,000-ticket performance); regression suites for pages 22, 24, 27–31, saved products/suppliers and compare pass; two timing misses in unrelated suites (Page 23 company read 402 ms; Pages 25–26 mark-all 1.3 s) were not caused by this work. Full table and the not-run list: `docs/backend/PAGE_36_TEST_REPORT.md`. Performance: `docs/backend/PAGE_36_PERFORMANCE_REPORT.md` (all targets met on one local machine). Screenshots: `docs/page-reports/screenshots/36-support-*.png`.

## Defects found and fixed during testing
Status-filter index mismatch; table clipped at 1440px (found by viewing the screenshot); see the test report.

## Files
Created: `src/lib/support/{ticketRules,ticketService,faq,channels}.ts`; `src/app/api/buyer/support/**`; `src/app/api/public/{faqs,support}/**`; `src/components/buyer/support/*`; `src/app/buyer/support/**`; tests `docs/page-reports/tools/36-*.mjs`; docs `docs/page-designs/36-buyer-help-support.md`, `docs/backend/PAGE_36_*.md`.
Modified: `settingsRules.ts`, `notifications.ts`, `buyerNav.ts`, `.env.example`, `src/app/layout.tsx`, `package.json`/lock, `CLAUDE.md`, `docs/backend/{DATABASE_SCHEMA,API_REFERENCE}.md`, `docs/PAGE_TRACKER.md`, the 25–26 test (F-03 expectation).

## Status
Design: Complete (spec + reference). Development: Implemented (not "Functionally Verified": the staff side and e-mail path do not exist or are untested). QA: In Progress (Chrome only; accessibility tooling, Lighthouse, other browsers not run).
