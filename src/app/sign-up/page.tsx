import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/AccountShell";
import { AccountSwitch } from "@/components/account/AccountSwitch";
import { SignUpForm } from "@/components/account/SignUpForm";

export const metadata: Metadata = { title: "Create Account | Finbyn Mart", robots: { index: false } };

export default function SignUpPage() {
  return (
    <AccountShell title="Create Account" subtitle="Join free to post requirements and request quotes.">
      <SignUpForm />
      <AccountSwitch title="Already have an account?">
        <Link href="/sign-in">Sign in</Link>
      </AccountSwitch>
    </AccountShell>
  );
}
