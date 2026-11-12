# Multi-portal architecture: compliance audit (2026-11-11)

The owner's portal rules are in `CLAUDE.md` section L. This is how the repository measured up the day they were adopted, what was changed, and what still needs a decision. Evidence: the code, plus `docs/page-reports/tools/portal-routing-test.mjs` (17 checks) and `portal-rules-unit-test.mjs` (7 checks), run against a production build.

## Compliant now (and tested)
| Rule | State |
|---|---|
| Buyer portal under `/buyer/*`, dashboard `/buyer/dashboard` | yes; the legacy `/account/inquiries` is a permanent redirect to `/buyer/inquiries` |
| Role-based redirect after sign-in, resolved on the server | **changed**: the login route returns `redirectTo` (`resolvePostLoginPath`): buyer → `/buyer/dashboard`; a requested page is kept only if public or in the user's own portal; a role, portal or redirect in the request body is ignored; off-site and API paths are refused. Before, every user went to `next ?? "/"` |
| Buyer navigation holds only buyer modules | **changed**: Account Security added (13 items); no supplier or admin link appears in a buyer's page (tested) |
| Buyer route protection | pages redirect an anonymous visitor to sign-in with `next`; an expired cookie is refused; buyer APIs answer 401 anonymous and 403 to a supplier; services query by the session buyer (Pages 22–38 suites) |
| Data isolation (buyer) | every buyer service names the session buyer; other buyers' records are the same 404 (per-page isolation tests) |
| Role never trusted from the client | the role comes from the stored account; a `role` cookie or body field grants nothing (tested) |
| One marketplace data source | catalogue, inquiries, quotations, orders, support are single sources; no per-portal duplicates |
| Logout and session expiry | logout revokes the server-side session; expired and revoked cookies are refused (Page 38 suite) |
| Tracker portal ownership | **changed**: Portal column on every page (PUBLIC 47 · BUYER 21 · SUPPLIER 14 · ADMIN 25); supplier dashboard route set to `/supplier/dashboard` |

## Not built, so not compliant yet (nothing is simulated)
| Rule | State | Needed |
|---|---|---|
| Supplier portal (`/supplier/*`, own layout and navigation) | no `/supplier` pages exist; a signed-in supplier lands on the public home page (flag `SUPPLIER_PORTAL_AVAILABLE = false` in `src/lib/auth/portals.ts`) and sees only a "Sign Out" in the public header | Page 39 onward; flip the flag with the supplier dashboard |
| Supplier company membership and tenant isolation | there is no company-membership model: a supplier account carries its business details inline on the user record | design the membership model with Page 39 (supplier APIs must resolve it on the server) |
| Admin portal and admin RBAC | none: only `buyer` and `supplier` roles exist; no admin routes | its own phase |
| Multiple roles / active-role selection | not supported: one role per account, set at registration; registering a supplier with a buyer's email is refused (tested) | only if the owner wants dual-role accounts |
| Supplier sidebar with the listed modules | none | with the supplier portal |

## Open decisions for the owner
1. **Response for an authenticated non-buyer on a buyer URL.** Today every buyer page renders a "Buyer accounts only" notice with HTTP 200 (no data is shown; tested). The rules ask for a redirect or a proper 403. Options: enable Next's `forbidden()` (an experimental flag, gives a real 403 page), or build the tracker's `/forbidden` and `/unauthorized` pages (IDs 76–77, no specification yet) and redirect to them. Not changed without that choice.
2. **Where a supplier lands before Page 39**: the public home page (current) or a holding page.
3. Whether the remaining baseline rows that still say `/account/*` (requirements, recently viewed, settings, notifications) should be built under `/buyer/*` (the rules name `/buyer` as the buyer base route; the pages are not built, so nothing needs moving yet).

## Not run
Cross-portal tests for the supplier and admin portals (they do not exist); multiple-role behaviour beyond "not supported"; responsive navigation of a supplier portal.
