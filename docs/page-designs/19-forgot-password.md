# Page 19 — Forgot Password (`/forgot-password`)

Design reference: the generated Page 19 image (chat only). Built on the shared account layout (`src/components/auth`), the same one as sign-in and registration.

## Layout

Two columns inside the global container (stacked below 1024px).

- Left teal panel (`AuthLayout` variant `forgot`): heading "Reset Your Password Securely", the PRD's supporting sentence, three steps (Check Your Email, Create a New Password, Get Back to Business) with Lucide icons in gold, and a note that the page never says whether an address has an account. **Not built:** the background photograph and the "Account Recovery" pill of the reference (no approved image asset exists; the breadcrumb and the panel heading already say what the page is).
- Right white card: lock badge, h1 "Forgot Password?", supporting sentence, one field "Business Email" (mail icon, placeholder "Enter your registered email"), button "Send Reset Link", an info box ("check your inbox and spam folder... valid for N minutes", N from the server setting), "Remember your password? Sign In".

Tokens only (`--primary`, `--primary-light`, `--accent`, `--radius-*`, `--space-*`); Anton headings, Montserrat text, Lucide icons. No new colours.

## States

Form · invalid email (inline error, `aria-invalid`, `aria-describedby`) · sending (button disabled "Sending...") · **generic success** "Check Your Email" with the same sentence for every address, three tips, and a resend button that counts down to the server's cooldown · rate limited (429, message, countdown from `retryAfter`) · email not set up (503, says so plainly; no success state) · network error.

## What the page never does

Say whether an address is registered, whether it is a buyer or supplier, whether an email was delivered, or ask the person to choose an account type. It sends no role, user id or redirect. It stores nothing in browser storage.

## Related pages

`/reset-password?token=` (the password form; built, shares `lib/auth/tokens.ts`), `/sign-in`. After a reset the person is sent to `/sign-in`: the PRD's `/login/buyer` and `/login/supplier` do not exist (there is one sign-in page for both roles).
