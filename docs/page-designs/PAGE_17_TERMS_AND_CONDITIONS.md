# Page 17 — Terms & Conditions

Route: `/terms-and-conditions` · Portal: PUBLIC · Tracker ID: 17 (original-78 numbering).

**Status: implemented as a REVIEWABLE DRAFT. Not approved, not legally reviewed, not for publication as final.** No approved terms existed before this work (the route was the generic "not published" placeholder in `src/app/[page]/page.tsx`; the static route now takes precedence, the placeholder is untouched for other footer pages). No legal compliance or enforceability is claimed.

## 1. Structure and architecture
| Item | Where |
|---|---|
| Page (server component; no data, API, session, cookies or writes) | `src/app/terms-and-conditions/page.tsx` |
| Typed draft content, stable section ids, approval status | `src/lib/constants/termsContent.ts` |
| Styles | reuses `src/app/privacy-policy/privacy-policy.module.css` (shortcut: extract a shared legal component if a third legal page is added) |
| Static checks (18) | `docs/page-reports/tools/81-terms-unit-test.mjs` |
| Env placeholders (empty) | `.env.example`: `TERMS_EFFECTIVE_DATE`, `TERMS_VERSION`, `TERMS_OPERATOR_NAME` |

Layout follows the reference: breadcrumb Home / Terms & Conditions, mint hero with H1 and one-line lead, draft note (or "Effective {date} · Version" when approved), sticky "On this page" list at ≥ 900 px, native `<details>` "On this page" below that, article column `max-width: 42rem`, contact block linking to `/contact-us` (e-mail only if `SUPPORT_EMAIL` is configured). The reference image's "Draft for business and legal review" pill and "Illustrative wording" annotations are review notes and are **not** in the public text. Footer, registration, contact and inquiry forms already link to `/terms-and-conditions`; Privacy Policy cross-link is in the distribution section.

Approval: `TERMS_EFFECTIVE_DATE` (YYYY-MM-DD) unset → draft notice and `noindex`; set it only after business approval and legal review. Operator section appears only when `TERMS_OPERATOR_NAME` is set. **Not set anywhere in this task.**

## 2. Verified platform rules (sources)
- Distribution: `src/lib/leads/distribution.ts` (guests/sample listings excluded, matching part of submission, no opt-out), `src/app/api/requirements/route.ts` (General Requirement = canonical inquiry, no selected supplier), `RequirementPostForm.tsx` (sign-in needed).
- Supplier view excludes phone, e-mail, address, account id (`src/lib/supplier/inquiryService.ts`, `leads/access.ts`).
- Conversations: `inquiry_messages`, never edited or deleted, per (inquiry, supplier) (`src/lib/inquiries/messages.ts`, `conversations.ts`).
- Quotations: DRAFT never visible to buyer, expiry derived from `validUntil`, accept only the current SENT version still valid, one accepted per inquiry, revision = new version, supplier withdraw only while waiting (`src/lib/quotations/quotationRules.ts`, `service.ts`); no tax stated → shown before tax.
- Orders: created only by the buyer's explicit confirmation, one per accepted quotation, stock reserved when tracked and refused when short, in-app supplier notice (`src/lib/orders/orderConfirmation.ts`). No buyer cancel route, payment, shipping, dispatch or refund feature exists (buyer orders API; no payment dependency).
- Moderation: product review before public (`productReview.ts`), unpublish (`productManagement.ts`), company suspension stops new inquiries (`companyEligibility.ts`), suspended account cannot sign in (`api/auth/login/route.ts`; no staff screen suspends a user account), supplier notices carry no internal reason (`supplierRules.ts`).
- Support channels: Contact Us form always; e-mail only if configured (`src/lib/support/channels.ts`).

## 3. Content evidence table
| Section (id) | Evidence | Proposed wording (summary) | Open decision |
|---|---|---|---|
| Overview | Whole product | Marketplace for discovery, requirements, inquiries, quotations; software role only: no payment, shipping, refunds; viewing ≠ acceptance. | Contractual role of the business (not seller, processor, shipper or guarantor is **not asserted either way**). |
| Who operates (`who-operates`) | None in repo | Only when `TERMS_OPERATOR_NAME` set. | **Legal entity**, address/registration. |
| Accounts | One role per account; registration consent; password change, sign out other devices | Accurate details, keep password secret, responsible for account. | **Eligibility** (age, authority to act for a business): not stated. |
| Buyer responsibilities | Quotation fields, privacy note on message contents | Accurate requirements, check quotation before accepting, appropriate communication. | Business review of the list. |
| Supplier responsibilities | Verification effective rule (`effectiveVerification`) | Accurate info, authority to offer, clear quotation terms, no misleading claims; no promise all suppliers are verified. | Business review; the global top bar claim "10L+ Verified Suppliers" conflicts with this (not changed here). |
| Requirements and distribution | Section 2 | Direct → selected + matching; General → matching only; guest → selected only; not optional; no guarantee of responses or count; contacts not shared; link to Privacy Policy. | Whether matching without choice needs a consent step (also in Page 16). |
| Conversations and quotations | Section 2 | Per-supplier private conversation, quotation lifecycle, acceptance conditions, before-tax display. | **Legal effect of acceptance** (binding or not) unresolved; text says it is not stated. |
| Orders and transactions | `orderConfirmation.ts` | Explicit confirmation creates the order; no payment, shipping, escrow, refund or cancel action. | **Payment, delivery, return and refund policy**; cancellation and dispatch policy (unbuilt). |
| Acceptable use | None enforced automatically | Proposed prohibitions only; no enforcement claim. | Enforcement and consequences. |
| Content and IP | None | Responsibility for submitted content. | **Licence to the business, ownership of marks, takedown procedure**: stated as not set out. |
| Moderation and restrictions | Section 2 | Existing features listed; supplier notice has no internal reason; no appeal described. | **Appeals, notification to buyers, when features are used.** |
| Disputes, liability, governing terms | No dispute feature exists | Says there is no dispute feature and that law, venue and liability limits are not yet set. | **Governing law, jurisdiction, arbitration, liability cap, indemnity, dispute deadlines** (legal). |
| Changes and contact | `/contact-us`, `channels.ts` | Date shown only when approved; Contact Us; e-mail only if configured. | Operator, contact e-mail, version history. |

## 4. Open business/legal decisions
Legal entity and role; eligibility; legal effect of quotation acceptance and order confirmation; payment/delivery/return/refund/cancellation policy; content licence, ownership and takedown; moderation consequences and appeals; governing law and dispute terms; liability and indemnity; contact e-mail; effective date and version; legal review. No jurisdiction-specific wording was drafted, so no official-source verification was needed or done.

## 5. Gaps found (documented, not changed)
- Registration consent is enforced and recorded by the server, but the stored `policyVersion` is the **consent-sentence** version (`CONSENT_VERSION`), not a terms version; the guest-inquiry record stores `policyVersion: null`. Consent sentences and the footer say "Terms of Use" while the page is "Terms & Conditions".
- Global header/footer claims ("10L+ Verified Suppliers", "50L+ Products") are unsupported; footer shows Refund/Cookie/Disclaimer links that still lead to the placeholder.
- `src/lib/inquiries/messages.ts` header comment says buyer replies do not exist; `conversations.ts` shows they do (stale comment).
- No consent wording, checkbox, login or registration behaviour was changed; viewing the page records nothing.

## 6. QA
Passed (dev server, headless Chrome): at 320, 360, 390, 430, 768, 1024, 1280, 1440, mobile landscape (844×390) and widths 640/512 simulating 200 %/250 % zoom: one H1, no heading skips, no duplicate or broken anchors (27 contents links), no horizontal overflow, desktop contents visible ≥ 1024 and mobile disclosure below, draft note present, no non-GET requests (only the header's `/api/auth/me`), no HTTP ≥ 400, no console errors, about 63–86 characters per line (estimate). Disclosure: opens by click and by Enter after Tab, visible focus ring, accessibility tree reports expanded false → true, anchor jump lands at 24 px after smooth scroll. Sign-up, register-supplier, contact-us and footer link to the route; `/contact-us` returns 200. 390 and 1440 full-page screenshots captured and reviewed. Static checks: 18/18.
Not run: Firefox, Safari, real devices, screen reader, contrast tool, Lighthouse, print; true browser zoom (simulated by width). Production-build HTML check and the full regression loop are recorded in the final report of the session that ran them.

## 7. Publication limitation
**Not publishable as final.** It is a draft with a visible notice and `noindex`; publication needs the decisions in section 4, legal review and `TERMS_EFFECTIVE_DATE` set in the hosting environment. Nothing was deployed.
