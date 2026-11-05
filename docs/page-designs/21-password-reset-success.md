# Page 21 — Password Reset Success (`/password-reset/success`)

Built on the shared account layout. Left teal panel (`AuthLayout` variant `resetDone`): "You're All Set!", three benefits (Secure & Updated, Account Safety, Continue Your Business). Not built: the reference photograph and "Account Recovery" pill (no approved image asset). Right card: success badge, h1 "Password Reset Successful!" (inside `role="status"`), the confirmation sentence, a **What happens next?** panel (`NextSteps`), the sign-in button, "Need help? Contact Support" (`/contact-us`).

**One primary sign-in action, chosen from the stored account:** "Sign In as Buyer" to `/login/buyer` or "Sign In as Supplier" to `/login/supplier` (the PRD forbids two competing primary actions for one account, so the reference's two buttons are not both shown). An unknown role gets a plain "Sign In" to `/sign-in`. Both login routes are aliases of `/sign-in`.

**Next steps:** "password updated" and (only when the stored event recorded it) "previous login sessions have been ended" are ticked; "Sign in with your new password" and "Continue using your account" are open circles, never ticked.

**Other states** (the success wording is never shown for these): missing or invalid confirmation ("Your password reset confirmation is unavailable", Sign In + Request Password Reset), expired ("This confirmation page has expired. You can sign in with your new password."), temporary failure ("Unable to retrieve the confirmation at the moment", with a Try Again button that asks the server again).
