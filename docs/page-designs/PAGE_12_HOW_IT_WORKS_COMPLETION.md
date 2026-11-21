# Page 12 — How It Works completion

Route `/how-it-works` (tracker Page 12). Static, server-rendered, public; no session, database or write. Copy lives in `src/lib/constants/howItWorksContent.ts` (draft wording awaiting business approval). No CMS integration exists for this page, so none was added.

## Evidence-based gap table
| Existing section / action | Source | Current implementation (before) | Verified gap | Correction |
|---|---|---|---|---|
| Whole page | tracker, audit ("FE Partial: homepage band only, no CTAs, no supplier content") | breadcrumb + the homepage four-step band, no h1 | Missing explanatory content; layout: no h1 (band used an h2) | PageIntro h1, band kept (hidden h2 on this page), buyer, distribution, supplier and "good to know" sections |
| Step wording "Get Multiple Quotes", "Evaluate and select the best offer", "Connect & Grow: do business", eyebrow "Simple & Secure" | brief: no best-offer, minimum-response or security claims | shared band (also on the homepage) | Misleading / unsupported claims | "Receive Quotes: Suppliers can respond with quotations", "Review the offers you receive and choose", "Discuss & Confirm", eyebrow "Simple Steps" |
| Direct vs general requirement, matching disclosure | CLAUDE.md leads rules, `matchingRules.ts` | not explained | Missing | "Who receives your inquiry or requirement" section |
| Supplier journey | supplier portal code | none | Missing | "For Suppliers" section |
| CTAs | brief | none | Missing | Post Requirement, Browse Products, Find Suppliers, Sign Up as Buyer, Register as Supplier, Sign In, Contact Us |

## Statements mapped to implementation
| Statement | Evidence |
|---|---|
| Public pages need no account | catalogue, category, industry and supplier pages are public |
| Direct inquiry as signed-in buyer or guest; a requirement needs a buyer account | `/api/public/inquiries` (buyer or guest, 403 for suppliers); `/api/requirements` uses `requireBuyerApi` |
| Requirement needs a chosen catalogue product; free text not posted or matched | `api/requirements/route.ts` (product must resolve, else field error); `docs/leads/GENERAL_REQUIREMENT.md` |
| Direct inquiry also reaches suppliers offering the same product (category, name, colour); not for guests | CLAUDE.md "Automatic matching lead distribution", `matchingRules.ts` (`match-1`/`match-2`); guests and sample listings get no distribution |
| General requirement has no selected supplier, shared with matching active suppliers, not all | `sourceType: GENERAL_REQUIREMENT`, empty `supplierKey`, `inquiry_recipients` |
| No opt-out | no such setting exists; mandatory per CLAUDE.md |
| Suppliers do not get e-mail, phone, address; free text shown as written | `supplier/inquiryService.ts` ("business name only"); `leads/access.ts` redacted MATCHED view; free-text redaction explicitly NOT implemented |
| Timing not instant, no promised time, no guaranteed responses | worker is leased and resumable; no scheduler deployed (`docs/leads/`); nothing promises delivery time |
| Responses and quotations in My Inquiries / Quotations; private conversations; compare versions; no cross-currency ranking | buyer routes, `inquiry_messages`, quotation compare (two versions of one quotation), `money.ts` |
| Accept, decline, request revision; confirm an order after acceptance; no payment/shipping | buyer quotation routes; `orders/orderConfirmation.ts` (explicit step, one per quotation); payment has no source |
| Supplier register, drafts, submit for review, only approved public, product approval is not company verification | `/register-supplier`, `/api/supplier/products/drafts`, product moderation rules, verification is Page 53 |
| Inquiries & Leads, matching leads not guaranteed; reply and quote privately; orders view-only | supplier portal pages and `PAGE_45` rules |
| Prices can be estimates; no ranking; not verified unless completed | CLAUDE.md catalogue note ("estimated prices"); `effectiveVerification` |

## CTA-to-route mapping
Post Your Requirement `/post-requirement`; Browse Products `/products`; Find Suppliers `/suppliers`; Sign Up as Buyer `/sign-up`; Register as Supplier `/register-supplier`; Sign In `/sign-in`; Contact Us `/contact-us`. All are plain links (no writes). Sign-in and registration pages already redirect a signed-in visitor by role (`resolvePostLoginPath`), so a supplier or admin is not left in a buyer-only action there. Post Requirement itself still requires a buyer account (the API refuses others); this link was not changed to hide per role.

## Existing design preserved
Logo, header, footer, teal/gold tokens, Anton/Montserrat, the homepage band component and its styles are unchanged apart from copy and an optional `showHeading` prop. New sections use existing tokens (a small page CSS module); no animation, carousel, tabs, statistics or testimonials.

## Checks actually performed (production build)
tsc, lint and build clean. `96-how-it-works-check.mjs`: 47 checks, 0 failed: 200 signed out; required statements present; no payment-protection, escrow, timing, count, "every supplier", opt-out or sample text; one h1, no heading jumps; all 41 internal links resolve; each CTA label maps to its route; at 320/360/390/430/768/1024/1280/1440 and landscape 844x390 / 640x360: no overflow, no clipped text, no horizontal slider, alt present, no write requests, no console errors; 200% zoom simulation; Tab reaches 35 controls with visible focus; computed contrast 6.2:1 (body) and 6.8:1 (primary CTA); back/forward. Screenshots `docs/page-reports/screenshots/12-how-it-works-*.png` (320, 1440, landscape 844).

## Not verified / limits
Destination workflows (inquiry submission, requirement posting, sign-up, supplier registration, quotation accept/order confirm) are not exercised by this task, only that the links open. Distribution runtime (worker delivery) is unverified, so no delivery or timing claim is made. Screen readers, Firefox/Safari/real devices, Lighthouse were not run. Wording needs business approval; pending decisions: whether to describe quotation comparison across suppliers (not described, because the implemented compare is between versions of one quotation), and whether Post Requirement should be hidden for supplier or admin sessions.
