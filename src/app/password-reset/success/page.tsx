import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { NextSteps, type NextStep } from "@/components/auth/NextSteps";
import { RetryButton } from "@/components/auth/RetryButton";
import styles from "@/components/auth/Auth.module.css";
import { getPasswordResetConfirmation } from "@/lib/auth/resetConfirmation";
import { withPagePerf } from "@/lib/perf/instrument";

// Personal to one browser: never cached, never indexed, no Referer sent onward (headers are also set in next.config.ts).
export const metadata: Metadata = { title: "Password Reset | Finbyn Mart", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const SUPPORT_HREF = "/contact-us";

/**
 * Shows success ONLY when the server issued a confirmation for a reset that committed (signed cookie + stored security
 * event). The address, a query string such as ?success=true, or any browser state proves nothing and is not read.
 * The page never changes a password or a token, and the confirmation is not a sign-in: the person signs in again.
 */
async function ResetSuccessPage() {
  const confirmation = await getPasswordResetConfirmation();

  if (confirmation.state === "VALID") {
    const signIn = confirmation.accountType === "BUYER" ? "Sign In as Buyer" : confirmation.accountType === "SUPPLIER" ? "Sign In as Supplier" : "Sign In";
    const steps: NextStep[] = [
      { text: "Your password has been updated.", status: "done" },
      confirmation.sessionsRevoked
        ? { text: "Your previous login sessions on this account have been ended.", status: "done" }
        : { text: "Sessions that were already signed in elsewhere may stay active until they expire.", status: "info" },
      { text: "Sign in with your new password.", status: "todo" },
      { text: "Continue using your Finbyn Mart account.", status: "todo" },
    ];
    return (
      <AuthLayout breadcrumb="Password Reset" variant="resetDone">
        <div role="status">
          <span className={styles.successBadge}>
            <CheckCircle2 size={36} aria-hidden />
          </span>
          <h1 className={styles.heading}>Password Reset Successful!</h1>
          <p className={styles.subheading}>Your Finbyn Mart account password has been updated successfully. You can now sign in using your new password.</p>
        </div>
        <NextSteps steps={steps} supportHref={SUPPORT_HREF} />
        <div className={styles.successActions}>
          <Link className={styles.linkButton} href={confirmation.loginPath}>
            {signIn}
          </Link>
        </div>
        <p className={styles.switch}>
          Need help?{" "}
          <Link className={styles.link} href={SUPPORT_HREF}>
            Contact Support
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const view =
    confirmation.state === "EXPIRED"
      ? { title: "This confirmation has expired", text: "This confirmation page has expired. You can sign in with your new password." }
      : confirmation.state === "UNAVAILABLE"
        ? { title: "Unable to retrieve the confirmation", text: "Unable to retrieve the confirmation at the moment. Please try again." }
        : { title: "Your password reset confirmation is unavailable", text: "There is no confirmation to show for this browser. If you reset your password, you can sign in with it now." };

  return (
    <AuthLayout breadcrumb="Password Reset" variant="recovery">
      <div className={styles.result} role="alert">
        <span className={`${styles.resultIcon} ${styles.resultIconWarn}`}>
          <MailWarning size={28} aria-hidden />
        </span>
        <h1 className={styles.heading}>{view.title}</h1>
        <p className={styles.subheading}>{view.text}</p>
      </div>
      <div className={styles.successActions}>
        {confirmation.state === "UNAVAILABLE" ? (
          <RetryButton label="Try Again" />
        ) : (
          <Link className={styles.linkButton} href="/sign-in">
            Sign In
          </Link>
        )}
        <Link className={styles.linkButtonSecondary} href="/forgot-password">
          Request Password Reset
        </Link>
      </div>
      <p className={styles.switch}>
        Need help?{" "}
        <Link className={styles.link} href={SUPPORT_HREF}>
          Contact Support
        </Link>
      </p>
    </AuthLayout>
  );
}

export default withPagePerf("page password-reset-success", ResetSuccessPage);
