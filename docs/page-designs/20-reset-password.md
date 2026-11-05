# Page 20 — Reset Password (`/reset-password?token=...`)

Design reference: the generated Page 20 image (chat only). Built on the shared account layout (`src/components/auth`).

## Layout

Two columns (stacked below 1024px). Left teal panel (`AuthLayout` variant `reset`): "Create a New Password", the PRD sentence, three benefits (Keep Your Account Safe, Protect Your Business Data, Continue Your Business) with Lucide icons, and a note that a reset signs the person out of every device and the link works once. **Not built:** the laptop/padlock photograph and "Account Security" pill of the reference (no approved image asset).

Right card: key badge, h1 "Reset Password", description, **New Password** and **Confirm New Password** (lock icon, separate show/hide buttons), the live requirements panel, **Reset Password** button, "Back to Sign In". No email field: the link identifies the account.

## Live requirements (from `PASSWORD_RULES`, the same limits the server enforces)

At least 10 characters · No more than 128 characters · Not only spaces · Not a commonly used password · Both passwords match. The reference shows uppercase, lowercase and number rows; those are **not** shown because the registration policy (the source of truth) does not require them. Nothing shows as met before the person types; the list is `aria-live` and says "(met)" / "(not met yet)" for screen readers.

## States

Missing link ("Password reset link is incomplete") · invalid ("cannot be verified") · expired · already used (CTA Go to Sign In) · replaced by a newer link · verification unavailable (temporary failure, with Try Again; never shown as invalid) · form · submitting · field errors · mismatch · success (the browser is sent to `/password-reset/success`, Page 21, which shows the confirmation only if the server issued one).

## Behaviour

Opening the page only inspects the link. Pressing the button sends the one POST. After load the token is removed from the address bar (`history.replaceState`); a refresh of the cleaned address shows "incomplete" and the person reopens the email link. After a committed reset the server sets a short-lived confirmation cookie and the form navigates to `/password-reset/success` (Page 21), which picks the sign-in destination from the stored role. Those two routes are aliases that redirect to the single sign-in page.
