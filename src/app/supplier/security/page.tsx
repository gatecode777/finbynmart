import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { BuyerSecurityPage } from "@/components/buyer/security/BuyerSecurityPage";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getBuyerSecurityOverview } from "@/lib/buyer/security";
import { SECURITY_TAB_KEYS, type SecurityTab } from "@/lib/security/securityRules";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Account Security | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The signed-in person's own account security. It reuses the account-wide security services and APIs (one identity, one session registry);
 * the user always comes from the session, never from the request, and a company owner cannot reach anyone else's passwords or sessions.
 */
async function SupplierSecurityRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const wanted = one(raw.tab);
  const tab: SecurityTab = SECURITY_TAB_KEYS.find((k) => k === wanted) ?? "overview";
  const { user } = await requireSupplierPage(`/supplier/security${tab === "overview" ? "" : `?tab=${tab}`}`, { allowSuspended: true });
  const overview = await getBuyerSecurityOverview(user.id).catch(() => null);

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/settings">Settings</Link> / Account Security
      </p>
      <h1 className={dash.title}>Account Security</h1>
      <p className={dash.welcome}>Manage security for your personal account.</p>
      <p className={dash.legendNote} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.75rem 1rem", borderRadius: 10, background: "var(--primary-light, #eaf5f3)" }}>
        <Info size={16} aria-hidden style={{ flex: "none", marginTop: 3 }} /> Your password and signed-in devices belong to your account, so changes here apply to every Finbyn Mart area you can sign in to.
      </p>
      <BuyerSecurityPage initialOverview={overview} initialTab={tab} />
      <p style={{ marginTop: "1.5rem" }}>
        <Link prefetch={false} href="/supplier/settings" className={dash.viewAll}>Back to Settings</Link>
      </p>
    </div>
  );
}

export default withPagePerf("page supplier-security", SupplierSecurityRoute);
