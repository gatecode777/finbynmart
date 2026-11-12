import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { BuyerSecurityPage } from "@/components/buyer/security/BuyerSecurityPage";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { getBuyerSecurityOverview } from "@/lib/buyer/security";
import { SECURITY_TAB_KEYS, type SecurityTab } from "@/lib/security/securityRules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), nothing about the account in the metadata.
export const metadata: Metadata = { title: "Account Security | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/security?tab=overview|password|2fa|sessions|activity|alerts. Identity comes from the session on the server. Only the summary is read here
 * (and a failure of it leaves the page working); each tab reads its own data from /api/buyer/security/* when it is opened. The sidebar highlights "Account Security";
 * the breadcrumb keeps it under Settings & Notifications.
 */
async function BuyerSecurityRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const wanted = one(raw.tab);
  const tab: SecurityTab = SECURITY_TAB_KEYS.find((k) => k === wanted) ?? "overview";
  const user = await requireBuyerPage(`/buyer/security${tab === "overview" ? "" : `?tab=${tab}`}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Account security for buyers is managed here.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const [overview, active] = await Promise.all([getBuyerSecurityOverview(user.id).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);

  return (
    <BuyerShell userName={user.name} activeKey="security" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/settings">Settings &amp; Notifications</Link> / Security
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Account Security</h1>
          <p className={dash.welcome}>Protect your account, monitor sign-in activity and manage authorized devices.</p>
        </div>
      </div>
      <BuyerSecurityPage initialOverview={overview} initialTab={tab} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-security", BuyerSecurityRoute);
