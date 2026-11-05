import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { BuyerRegisterForm } from "@/components/auth/BuyerRegisterForm";
import authStyles from "@/components/auth/Auth.module.css";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/inquiries/rules";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Create Buyer Account | Finbyn Mart", robots: { index: false } };

async function BuyerRegistrationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Where to go after registering: a path on this site only (never another address).
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw) ?? undefined;
  // someone who is already signed in has no use for a registration form
  if (await getCurrentUser()) redirect(next ?? "/");
  return (
    <AuthLayout breadcrumb="Create Buyer Account" variant="buyer">
      <h1 className={authStyles.heading}>Create Your Buyer Account</h1>
      <p className={authStyles.subheading}>Fields marked * are required.</p>
      <BuyerRegisterForm next={next} />
    </AuthLayout>
  );
}

export default withPagePerf("page register-buyer", BuyerRegistrationPage);
