# Page 16 — Privacy Policy

Route: `/privacy-policy` · Portal: PUBLIC · Tracker ID: 16 (original-78 numbering).

**Status (updated 2026-11-18): the owner set the effective date to 2026-11-18 in the local, git-ignored `.env.local` (`PRIVACY_POLICY_EFFECTIVE_DATE=2026-11-18`).** Locally the page therefore shows "Effective 18 November 2026", no draft notice, and is indexable. This is the owner's decision on the date; it is **not** a legal review, and the open decisions in section 4 (operator name, privacy contact, retention periods, request process, provider naming, consent for matching) are still unanswered. The variable is **not set in any hosting environment and nothing was deployed**: a deployed site shows the draft notice and `noindex` until it is set there too (`.env.example` now lists the three variables, empty). No legal compliance with any law is claimed anywhere on the page or in this document.

## 1. What was built

| Item | Where |
|---|---|
| Page (server component, no data, no API, no session) | `src/app/privacy-policy/page.tsx` |
| Styles (tokens only, CSS Module) | `src/app/privacy-policy/privacy-policy.module.css` |
| Typed draft content, stable section ids, approval status | `src/lib/constants/privacyPolicy.ts` |
| Doc comment in the consent constants (no consent wording changed) | `src/lib/legal.ts` |
| Static checks (19) | `docs/page-reports/tools/80-privacy-policy-unit-test.mjs` |

Not built, on purpose: consent checkbox, "accept" action, cookie banner, CMS, database, API, deletion or export service, language switcher, print/PDF. The page does not treat browsing as consent.

### Layout
- Hero (shared pattern from About Us): breadcrumb Home / Privacy Policy, `h1`, one-line lead, and either the draft note (`role="note"`) or "Effective {date} · Version {v}".
- Desktop (≥ 900 px): sticky "Contents" list beside the article. Below 900 px: a native `<details>` "On this page" above the article (its expanded state is exposed to assistive technology without script). Both lists are plain `#id` links, so the page works with JavaScript off.
- Article column `max-width: 42rem` (about 65–80 characters per line). Sections are `<section id aria-labelledby>` with an `h2`; `h3` is used only inside "Requirements and supplier sharing". `scroll-margin-top` keeps a jumped-to heading visible; `:target` underlines it.
- Closing contact block: link to the existing `/contact-us`; an e-mail address appears only if `SUPPORT_EMAIL` is configured (`getSupportChannels()`).
- Lists restore bullets (`list-style: disc`) because `src/styles/reset.css` removes them globally.

### Approval and publication mechanism
| Variable | Effect | Unset means |
|---|---|---|
| `PRIVACY_POLICY_EFFECTIVE_DATE` (`YYYY-MM-DD`) | Marks the text approved: shows "Effective …", removes the draft note, allows indexing | Draft note shown, `robots: noindex,follow`, no date |
| `PRIVACY_POLICY_VERSION` | Shown after the date | Not shown |
| `PRIVACY_OPERATOR_NAME` | Adds a "Who operates Finbyn Mart" section | Section omitted (never guessed) |
| `SUPPORT_EMAIL` | Shows a privacy contact address | Only the Contact Us link |

A malformed date counts as unset. The page reads these when it is rendered/built; after changing them redeploy (or restart) and re-check the page. Setting the date is the business's approval act: do it only after the text below has been confirmed and reviewed by a qualified person.

## 2. Verified data-handling facts

Each statement on the page was written from the implementation; the static test ties the numbers and the named behaviours to the code so the text cannot silently drift.

- **Passwords** are stored as scrypt hashes (`src/lib/auth/password.ts`).
- **Sessions:** cookie `finbyn_session`, httpOnly, 7-day maximum; the `auth_sessions` record stores a hash of the session id, device labels and times, and is removed 30 days after expiry (`sessionRegistry.ts`).
- **One-time e-mail links** are removed one day after expiry (`tokens.ts`). **Notifications** are removed after 180 days (`notificationRules.ts`).
- **Guest inquiries** are marked with a 730-day retention (`GUEST_RETENTION_MS`, `src/lib/inquiries/service.ts`) but **no purge job exists**, and the page says so.
- **Direct inquiry (signed-in buyer):** goes to the selected supplier and, through policy `match-1`/`match-2`, to other eligible supplier companies with the same listing. There is no opt-out in the code (`src/lib/leads/distribution.ts`, `matchingRules.ts`).
- **General Requirement:** same canonical inquiry (`sourceType: "GENERAL_REQUIREMENT"`), no selected supplier, matching suppliers only, sign-in required.
- **Guest inquiry:** no buyer id, so no distribution; the selected supplier only.
- **What a supplier sees:** the supplier DTO (`src/lib/supplier/inquiryService.ts`) carries title, message (as written, no redaction), category, quantity, unit, delivery location text, required-by date, specifications and buyer name/kind. A MATCHED view additionally hides the selected supplier, shared status history, guest/contact fields and the product page link (`src/lib/leads/access.ts`). No phone, e-mail, address or account id is in the DTO. The buyer name is the company name or "Individual buyer" (`quoteService.ts`).
- **Cookies set by the site:** the sign-in cookie; `finbyn_inquiry_access` (guest confirmation page, one hour); `finbyn_reset_ok` (password-reset confirmation). No analytics or advertising cookie or script is in the code.
- **Browser storage:** supplier menu size and list/grid view (local); requirement draft, support search text, one-time toast message (session).
- **Third parties by category:** cloud database (MongoDB driver), ImageKit image hosting (`src/lib/media/imagekit.ts`), e-mail delivery API (`src/lib/email/provider.ts`, only when configured), hosting platform performance measurement (`@vercel/speed-insights`, rendered only when `VERCEL` is set). Fonts come through `next/font` (self-hosted at build).
- **Privacy requests:** profile/company/address/notification edits and session management exist; data export and account deletion are explicitly "not automated yet" (`src/components/buyer/settings/NotAvailable.tsx`).

## 3. Content evidence table

| Section (id) | Implementation evidence | Proposed wording (summary) | Unresolved decision |
|---|---|---|---|
| Overview (`overview`) | Whole-site behaviour | Describes how information is handled today; no promises about the future. | None for the draft. |
| Who operates (`who-operates`) | None in the repo (no company name, address or registration) | Appears only when `PRIVACY_OPERATOR_NAME` is set. | **Legal entity name** (and whether to show address/registration). |
| Information collected (`information-collected`) | Registration, profile, company, address, inquiry, support, document, wishlist/compare, session and security-event code | Lists categories actually stored; says passwords are hashed. | Whether the list should be finer-grained for legal review. |
| How information is used (`how-used`) | Services in `src/lib/*` (auth, inquiries, leads, orders, support, admin review) | Operational purposes only; no marketing, profiling or sale of data is claimed or denied. | **Marketing/communications policy** (none exists in code; the page is silent). |
| Requirements and supplier sharing (`requirements-sharing`) | `distribution.ts`, `matchingRules.ts`, `access.ts`, supplier `inquiryService.ts` | Direct inquiry → selected + matching suppliers (not optional); General Requirement → matching only, sign-in required; guest → selected only; field list; no delivery or timing promise. | Whether matching without choice is acceptable and needs a consent mechanism (business and legal); free-text redaction is **not built**, page tells users not to type contact details. |
| Public and private information (`public-private`) | Public supplier pages, private document storage (`documentStorage.ts`), role guards | Public: supplier business info and images; private: contact, security, saved items, tickets, conversations, documents. | None for the draft. |
| Service providers (`service-providers`) | Database, ImageKit, e-mail API, Vercel Speed Insights usage | Named by category only; no locations, contracts or sub-processor list. | **Provider names and data locations** (whether to publish); whether the performance-measurement provider must be named. |
| Cookies and browser storage (`cookies-storage`) | `session.ts`, `guestAccess.ts`, `resetConfirmation.ts`, storage keys in components | Three cookies and five storage keys; no analytics/ad cookies. | If analytics or marketing is ever added, this section and a consent mechanism must change first. |
| Retention (`retention`) | Constants listed in section 2; no guest purge; no other TTL | Only periods that code enforces; states that guest purge and other deletion are not in operation. | **Retention periods for accounts, inquiries, orders, documents, tickets** (none defined); decision to build the guest purge. |
| Privacy requests (`privacy-requests`) | `NotAvailable.tsx`; no request workflow | Export/deletion are handled by a person via Contact Us; nothing happens automatically; no response time. | **Request process, owner, response time, identity verification**; whether to build export/deletion. |
| Security (`security`) | scrypt, httpOnly session, rate limiting, content checks, RBAC, audit log | Measures stated plainly; no certification or absolute-security claim. | Whether to describe encryption in transit/at rest (hosting-provider facts not verified here, so omitted). |
| Changes and contact (`changes-contact`, `contact`) | `/contact-us` exists; `getSupportChannels()` env-driven | Effective date shown only when approved; Contact Us link; e-mail only if configured. | **Privacy contact address** (`SUPPORT_EMAIL`); grievance/officer details if required. |

## 4. Business decisions needed before publication

1. Legal entity name that operates Finbyn Mart (`PRIVACY_OPERATOR_NAME`) and address/registration to show, if any.
2. A real privacy contact (`SUPPORT_EMAIL`) and who answers it.
3. Retention periods for accounts, inquiries, orders, documents, tickets, and whether to build the guest-inquiry purge.
4. How privacy requests (access, correction, export, deletion) are received, verified and answered, including any response time to state.
5. Whether to name service providers and their data locations, and whether the performance-measurement provider must be named.
6. Whether marketplace-wide matching of inquiries to other suppliers needs an explicit consent step, and whether to build free-text redaction.
7. Approval of the effective date and version number.
8. Whether the Terms page (still unpublished) should be written at the same time.

## 5. Legal wording requiring review

Everything on the page is draft wording for a qualified reviewer to confirm, in particular: the purposes list, the supplier-sharing explanation and the statement that it is not optional, the retention section, the privacy-requests section, the security section and the "cannot guarantee absolute security" sentence. This document makes no statement about whether any wording satisfies any statute or regulation.

## 6. Discrepancies found (not changed, per scope)

- The inquiry form's consent sentence refers to sharing with "this supplier"; matching to other suppliers is disclosed only in the separate sharing note on the form (`InquiryWorkspace.tsx`, `SHARING_NOTICE`). The policy states the full behaviour; the consent sentence and `CONSENT_VERSION` were **not** edited.
- Guest inquiries are marked for two-year retention but nothing deletes them.
- Rate-limit records are keyed by network address and expire within about an hour (mentioned on the page).
- Global header/footer carry unsupported claims ("10L+ Verified Suppliers", "50L+ Products") already flagged in the About Us record; not part of this page.
- The Terms of Use page remains an honest "not published" page; `legal.ts` comment updated accordingly.

## 7. QA

Run:
- `tsc --noEmit`, `npm run lint`, the 51 unit scripts (including the 19 checks of test 80), and a production build (`NEXT_DIST_DIR=.next-audit`) all passed on this change.
- Headless Chrome against the dev server, 11 configurations: 320, 360, 390, 430, 768, 1024, 1280, 1440, mobile landscape (844×390), 640 and 512 wide (simulating 200 % and 250 % zoom). Results: no horizontal overflow, exactly one `h1`, correct heading order, no duplicate or broken anchors, no non-GET requests, only the global header's `/api/auth/me` call, no console or HTTP errors; desktop contents visible from 1024, mobile disclosure at 768 and below; the disclosure exposes `expanded` false → true; an anchor jump lands under the scroll margin; the disclosure opens by keyboard with a visible focus ring; the Sign Up, Register Supplier, Contact Us and footer links reach `/privacy-policy`; `/contact-us` returns 200.
- Screenshots (390 and 1440) were taken and reviewed.

Not run: Firefox, Safari, real devices, a screen reader, a contrast tool, Lighthouse, print output, other zoom levels in a real browser. The 200 % zoom check is simulated by viewport width. Legal review has not happened.

## 8. Publication blocker

The date is set locally (owner, 2026-11-18). **Public publication is still not done:** no deployment exists or was verified, the variable is not set in any hosting environment, a qualified reviewer has not reviewed the wording, and the section 4 decisions are open (without an operator name and privacy contact the page names no responsible party and offers only the Contact Us form). Before going live: set the variable (and ideally operator, version and `SUPPORT_EMAIL`) in the hosting environment, redeploy, and re-check the page. Verified after the change on the dev server: "Effective 18 November 2026" shown, draft notice and `robots` meta absent. Tracker: Development Implemented, QA In Progress, Design not complete.

## 9. Pending addition from Page 32 (Recently Viewed): NOT yet in the public text
Since 2026-11-20 a signed-in buyer's product views are stored against the account (`recently_viewed`: buyer id, product key, last-viewed time; at most 100 products; removable by the buyer; no automatic expiry). The public policy text above does not yet mention this, so it lags the code until the owner approves wording. Proposed sentence for review (not published): "Your choices on the site: ... and, for signed-in buyers, a history of the products you recently opened, which you can remove or clear from Recently Viewed." The Retention section would also need: "the recently viewed list keeps your 100 most recent products and has no automatic expiry." Add to `privacyPolicy.ts` and test 80 only after approval.
