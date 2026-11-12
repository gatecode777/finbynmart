import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SupplierShell } from "@/components/supplier/SupplierShell";
import { requireSupplierPage } from "@/lib/auth/guards";

// Every supplier page is private: noindex, never cached, nothing about the company in the metadata.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The layout of the whole supplier portal. It is the first thing that runs for any /supplier URL: an anonymous visitor goes to sign-in, a signed-in
 * user who is not a supplier with an ACTIVE company goes to /forbidden?portal=supplier, and in both cases no supplier page code or data runs. Only a
 * supplier gets the shell; each page and API still scopes its own queries to the company the session resolves to.
 */
export default async function SupplierLayout({ children }: { children: ReactNode }) {
  const { context } = await requireSupplierPage("/supplier/dashboard");
  return <SupplierShell companyName={context.profile.displayName}>{children}</SupplierShell>;
}
