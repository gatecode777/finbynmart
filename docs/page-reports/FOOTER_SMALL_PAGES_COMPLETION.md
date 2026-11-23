# Footer small pages — completion report

Scope: the footer destinations that were served by the generic "isn't published yet" placeholder in `src/app/[page]/page.tsx`. These are NOT new original-plan pages; the 78-page tracker is not renumbered or changed.

## How it is built
- One typed source `src/lib/constants/infoPages.ts` (17 pages) and one shared view `src/components/info/InfoPageView.tsx` (breadcrumb, one H1, lead, contents, sections, CTA box; reuses the Terms/Privacy article styles).
- Served by the existing `[page]` route: an info page is looked up first, other footer slugs keep the old placeholder. No duplicate routes.
- Static and server-rendered; no database read, no write. The session is read only on pages with a private CTA (to choose "sign in then go there" or "go there").
- `/contact-us` accepts `?topic=` (allowlisted against `SUPPORT_TOPICS`, anything else ignored) through a new `initialTopic` prop of `ContactForm`. Validation, consent, rate limit and persistence are unchanged.
- Contact e-mail is shown only if `SUPPORT_EMAIL` is configured (existing `getSupportChannels`); none is invented. No media contact exists, so none is shown.

## Footer destinations
| Label | URL | Previous state | Now | Content source | Remaining |
|---|---|---|---|---|---|
| Success Stories | `/success-stories` | placeholder | Finished page, honest "no stories published", Contact Us CTA; noindex | `infoPages.ts` | Business: approved, attributable stories |
| Blog | `/blog` | placeholder | Honest "no articles"; links existing guides, labelled as not blog articles; noindex | `infoPages.ts` | Business: articles |
| Careers | `/careers` | placeholder | "No openings published", no address/process; noindex | `infoPages.ts` | Business: openings |
| Press & Media | `/press` | placeholder | Neutral description (from About Us) and "no press materials"; noindex | `infoPages.ts` | Business: approved assets, media contact |
| Buyer Guide | `/buyer-guide` | placeholder | Guide from the implemented buyer flow incl. accurate matching wording | `infoPages.ts`, `howItWorksContent.ts` facts | Content approval |
| Safety Tips | `/safety-tips` | placeholder | Practical tips; states no guarantee, no escrow, no verification of every supplier | `infoPages.ts` | Content approval |
| Supplier Membership | `/supplier-membership` | placeholder | States no plans/prices published; lists what a supplier account does today | `infoPages.ts` | Business: plans (payments deferred) |
| Lead Management | `/lead-management` | placeholder | Direct vs matched leads, inbox actions; CTA to `/supplier/inquiries` through sign-in | `infoPages.ts`, CLAUDE.md lead rules | Content approval |
| Pricing | `/pricing` | placeholder | States no pricing published; no free/paid promise | `infoPages.ts` | Business: pricing (payments deferred) |
| Supplier Guide | `/supplier-guide` | placeholder | Register, profile vs verification vs product approval (kept distinct), drafts, leads, quotations, orders | `infoPages.ts` | Content approval |
| Supplier Success Stories | `/supplier-success-stories` | placeholder | Same honest empty state, supplier audience; noindex | `infoPages.ts` | Business: stories |
| Track Inquiry | `/track-inquiry` | placeholder | Explains private tracking; CTA to `/buyer/inquiries` through sign-in; no lookup by reference | `infoPages.ts` | none |
| Report Abuse | `/report-abuse` | placeholder | Guidance + link to `/contact-us?topic=REPORT_PROBLEM` (existing persisted intake); no fake form, no response time | `infoPages.ts`, `rules.ts` | Business: moderation process (none claimed) |
| Feedback | `/feedback` | placeholder | Guidance + link to `/contact-us?topic=FEEDBACK` | same | none |
| Refund Policy | `/refund-policy` | placeholder | Labelled REVIEW DRAFT, noindex, no date: no payments/refunds today; lists open decisions | Terms draft facts | Business and legal decision |
| Cookie Policy | `/cookie-policy` | placeholder | Review draft: cookie and storage inventory equal to Privacy Policy; no analytics/ad cookies | `privacyPolicy.ts` | Legal review |
| Disclaimer | `/disclaimer` | placeholder | Review draft: information shown as listed, no guarantees; liability/governing law listed as open | Terms draft | Legal review |

Preserved untouched: About Us, How It Works, Post Requirement, categories/suppliers, Register Supplier, Contact Us (only the topic preset added), Help/FAQs (`/faqs` still the redirect to `/help`), Sitemap, Privacy Policy, Terms, FAQ source.

## Status
- **Software complete:** all 17 destinations render a page-specific finished page.
- **Content-empty but functional:** Success Stories, Supplier Success Stories, Blog, Careers, Press (noindex until real content exists).
- **Business/legal approval pending:** Refund Policy, Cookie Policy, Disclaimer (drafts, no effective date, no approval mechanism yet — record approval separately); all guide wording; Membership and Pricing (no plans exist).
- **Runtime verification pending:** signed-in behaviour (a signed-in visitor gets the direct link instead of the sign-in link; not exercised), reuse of `/contact-us` submission with a preset topic (the topic preset was tested, a submission was not).

## Tests actually run
- `tsc --noEmit`, `npm run lint`, production build (`.next-audit`): clean.
- `docs/page-reports/tools/footer-pages-check.mjs` against a `next start` with a dead database URI (no database touched): 115/115 passed. Per page at 320/390/768/1280/1440: HTTP 200, exactly one H1, no horizontal overflow, footer present, not the generic template; no console errors per page; track-inquiry and lead-management sign-in links keep the destination; report-abuse and feedback topic links; `?topic=` accepts the two allowed values and ignores `<script>` and unknown values; legal pages show the draft notice, noindex and no effective date; no overflow at 200% zoom for three representative pages. One screenshot (Lead Management, 1280) was inspected, which found and led to fixing a layout bug (article in the narrow sidebar column).
- Not run: Firefox/Safari/devices, accessibility tooling, signed-in portal checks, a Contact Us submission (needs an isolated database), the existing unit suites (none cover these pages).

## Not done on purpose
No membership/pricing numbers, no stories, articles, vacancies, press items, media contact, refund rule, liability cap or governing law were invented; no form, ticketing, e-mail or CMS was added; the footer layout is unchanged; no authoritative legal source was consulted because no jurisdiction-specific statement was drafted.
