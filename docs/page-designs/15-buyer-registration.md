# Page 15 — Buyer Registration (`/register/buyer`, entry `/register`)

Status (Design / Development / QA): Design reference received (3 images, chat only) / Implemented, tested against the throwaway database / QA not complete (see "Not verified" in `docs/page-reports/15-buyer-registration-report.md`).

## Routes

| Route | Purpose |
|---|---|
| `/register` | Entry point. Redirects to `/register/buyer`, keeping a safe `?next=` path (`safeNext`: a path on this site only). |
| `/register/buyer` | The buyer registration page. A signed-in visitor is redirected away (to `next` or `/`). |
| `/sign-up` | The older, simpler buyer form is **still served** (several test suites sign accounts up through it). It accepts 8-character passwords; `/register/buyer` requires 10. The sign-in page now links to `/register/buyer`. Retiring `/sign-up` is an open decision. |
| `/forgot-password`, `/reset-password?token=`, `/verify-email?token=`, `/verify-email/resend` | Recovery and confirmation pages (same card layout, `components/auth`). |
| `/contact-us` | Contact Us form (replaces the "planned page" placeholder for this one footer route). |

## Layout (from the reference)

Desktop: two columns inside the global container. Left, a teal panel "Join Finbyn Mart" with four benefits (post requirements, contact suppliers, save products and suppliers, review suppliers) and a plain note that companies and mobile numbers are **not verified** at sign-up. Right, a white card "Create Your Buyer Account" with a two-column field grid. Below 1024px the panel stacks above the card; below 640px the field grid is one column. Tokens only (`--primary`, `--accent` for the benefit icons, `--radius-*`, `--space-*`); no new colours, no hard-coded hex that has a token.

Fields (all required): Full Name, Business Email, Mobile Number (country code select + number), Company Name, Password (show/hide, strength meter), Confirm Password, consent checkbox (never pre-ticked). Submit button "Create Buyer Account". Links: Sign in, Register as a supplier.

Not built, deliberately: Google / LinkedIn sign-up (no OAuth provider exists), "Send OTP" / "Verify mobile" (no SMS provider exists). The page shows no control for either, so nothing looks available that is not.

## Rules (single source: `src/lib/auth/buyerRegistration.ts`, used by the form and the server)

- Name 2–100 characters, at least one letter, no `<` or `>`. Any script.
- Email: the shared inquiry rule; stored trimmed and lower-cased; unique index on `users.email` (one account per address; a repeat answers 409 on the email field).
- Mobile: the shared phone rule (+91 10 digits starting 6–9, +971 9, +1 10, +44 10, +65 8, +86 11); stored `{ countryCode, number, normalized: "+91 9876543210" }`. **Not unique** (a company may share a number; an unverified number must not let one person lock another out). Never verified.
- Company 2–150 characters, no `<` `>`. Stored as typed with `companyStatus: "UNVERIFIED"`. No company record is created or claimed.
- Password 10–128 characters, not blank, not on a short common-password list, not one repeated character. Never trimmed or truncated. No character-class rules. The strength meter is guidance only.
- Consent must be exactly `true` and carry the current wording version (`CONSENT_VERSION` in `src/lib/legal.ts`); stored with the time and version.
- `role`, `accountStatus`, `emailVerified`, `phoneVerified`, `companyId`, `passwordHash`, `permissions`, `isAdmin`, `userId`, `_id`, `verified` in a request are **refused** (400 on that key), not ignored.

## States

Empty form · field errors (all at once, focus to the first invalid field, `aria-invalid`, `aria-describedby` to the message) · submitting (button disabled, "Creating account...") · server error banner · email already registered (message + sign-in link) · success A (no email provider: signed in, redirected to `next` or `/`) · success B (provider configured: "Check your email" with the address, resend button; **not** signed in) · provider failed (account exists, says the email was not sent, offers a new link).

## Accessibility and responsive

Semantic form with labels bound to inputs, one `h1`, errors `role="alert"`, show/hide button with `aria-label` and `aria-pressed`, 22px checkbox, 44–48px controls, 16px field text (no iOS zoom), focus rings from tokens, `prefers-reduced-motion` respected. Verified at the 16 widths 320–2560 (no horizontal overflow, controls inside the viewport) on `/register/buyer`, `/forgot-password`, `/contact-us`.

## Honesty rules that apply to this page

No "verified" wording for companies, emails or numbers unless a verification really happened; no claim that an email was sent unless the provider accepted it; no social or OTP buttons; consent not pre-ticked.
