import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { EmailRequestForm } from "@/components/auth/RecoveryForms";
import styles from "@/components/auth/Auth.module.css";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Send Confirmation Link | Finbyn Mart", robots: { index: false } };

async function ResendVerificationPage() {
  return (
    <AuthLayout breadcrumb="Confirm Email" variant="recovery">
      <h1 className={styles.heading}>Send a new confirmation link</h1>
      <p className={styles.subheading}>Enter the email address you registered with. If it is waiting for confirmation, we will send a new link.</p>
      <EmailRequestForm purpose="verify" />
    </AuthLayout>
  );
}

export default withPagePerf("page verify-email-resend", ResendVerificationPage);
