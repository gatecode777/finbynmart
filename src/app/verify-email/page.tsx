import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { VerifyEmailFlow } from "@/components/auth/RecoveryForms";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Confirm Email | Finbyn Mart", robots: { index: false }, referrer: "no-referrer" };

async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return (
    <AuthLayout breadcrumb="Confirm Email" variant="recovery">
      <VerifyEmailFlow token={token} />
    </AuthLayout>
  );
}

export default withPagePerf("page verify-email", VerifyEmailPage);
