import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm, type LinkState } from "@/components/auth/ResetPasswordForm";
import { toPublicState } from "@/lib/auth/resetMessages";
import { inspectToken } from "@/lib/auth/tokens";
import { withPagePerf } from "@/lib/perf/instrument";

// The link carries a secret: never cached, never indexed, no Referer sent onward (headers are also set in next.config.ts).
export const metadata: Metadata = { title: "Reset Password | Finbyn Mart", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  // Only LOOKS at the link (a GET, which mail scanners also make, never uses it); the button's POST is what consumes it.
  let state: LinkState = "MISSING";
  if (token) {
    try {
      state = toPublicState(await inspectToken(token, "reset_password"));
    } catch {
      state = "UNAVAILABLE"; // a temporary failure is not an invalid link
    }
  }
  return (
    <AuthLayout breadcrumb="Reset Password" variant="reset">
      <ResetPasswordForm token={state === "VALID" ? token : ""} initialState={state} />
    </AuthLayout>
  );
}

export default withPagePerf("page reset-password", ResetPasswordPage);
