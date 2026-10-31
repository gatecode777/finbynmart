import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/AccountShell";
import { AccountSwitch } from "@/components/account/AccountSwitch";
import { SignInForm } from "@/components/account/SignInForm";

export const metadata: Metadata = { title: "Sign In | Finbyn Mart", robots: { index: false } };

export default function SignInPage() {
  return (
    <AccountShell title="Sign In" subtitle="Sign in to manage your requirements and inquiries.">
      <SignInForm />
      <AccountSwitch title="Don't have an account?">
        <Link href="/sign-up">Sign up as a buyer</Link>
        <Link href="/register-supplier">Register as a supplier</Link>
      </AccountSwitch>
    </AccountShell>
  );
}
