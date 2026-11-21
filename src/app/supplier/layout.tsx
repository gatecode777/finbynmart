import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SupplierShell } from "@/components/supplier/SupplierShell";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

// Every supplier page is private: noindex, never cached, nothing about the company in the metadata.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The layout of the whole supplier portal. It is the first thing that runs for any /supplier URL: an anonymous visitor goes to sign-in, a signed-in
 * user who is not a supplier with an ACTIVE company goes to /forbidden?portal=supplier, and in both cases no supplier page code or data runs. Only a
 * supplier gets the shell; each page and API still scopes its own queries to the company the session resolves to.
 */
export default async function SupplierLayout({ children }: { children: ReactNode }) {
  // An anonymous visitor gets no shell and no data here: the page's own guard redirects to sign-in with the requested path as `next`
  // (a layout does not know the path). Every supplier page must call requireSupplierPage (test 70 enforces it).
  if (!(await getCurrentUser().catch(() => null))) return <>{children}</>;
  const { context } = await requireSupplierPage("/supplier/dashboard", { allowSuspended: true });
  const suspended = context.company.status === "SUSPENDED";
  return (
    <SupplierShell companyName={context.profile.displayName}>
      {suspended && (
        <p role="status" style={{ margin: "0 0 var(--space-4, 1rem)", padding: ".75rem 1rem", borderRadius: 8, background: "var(--accent-light, #fff7e5)", fontSize: ".9rem" }}>
          Your company access is restricted. Quotations, orders, products and inquiries are unavailable until it is reactivated; your existing records are kept. Support and account security remain available.
        </p>
      )}
      {children}
    </SupplierShell>
  );
}
