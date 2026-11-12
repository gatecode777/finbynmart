import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignInForm } from "@/components/auth/SignInForm";
import styles from "@/components/auth/Auth.module.css";
import { getCurrentUser } from "@/lib/auth/session";
import { resolvePostLoginPath } from "@/lib/auth/portals";
import { safeNext } from "@/lib/inquiries/rules";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Sign In | Finbyn Mart", robots: { index: false } };

async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Where to go after signing in: a path on this site only (never another address).
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw) ?? undefined;
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(resolvePostLoginPath(user.role, next));
  return (
    <AuthLayout breadcrumb="Sign In" variant="signin">
      <h1 className={styles.heading}>Sign In</h1>
      <p className={styles.subheading}>Sign in to manage your requirements and inquiries. Fields marked * are required.</p>
      <SignInForm next={next} />
    </AuthLayout>
  );
}

export default withPagePerf("page sign-in", SignInPage);
