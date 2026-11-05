import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/RecoveryForms";
import { resendCooldownSeconds, resetTtlMinutes } from "@/lib/auth/securityConfig";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Forgot Password | Finbyn Mart", robots: { index: false } };

async function ForgotPasswordPage() {
  return (
    <AuthLayout breadcrumb="Forgot Password" variant="forgot">
      <ForgotPasswordForm validMinutes={resetTtlMinutes()} cooldownSeconds={resendCooldownSeconds()} />
    </AuthLayout>
  );
}

export default withPagePerf("page forgot-password", ForgotPasswordPage);
