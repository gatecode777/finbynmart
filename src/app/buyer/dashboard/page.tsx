import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { BuyerDashboardControls } from "@/components/buyer/BuyerDashboardControls";
import { BuyerStatsGrid } from "@/components/buyer/BuyerStatsGrid";
import { InquiryOrderTrend } from "@/components/buyer/InquiryOrderTrend";
import { TopInquiryCategories } from "@/components/buyer/TopInquiryCategories";
import { RecentInquiries } from "@/components/buyer/RecentInquiries";
import { RecentQuotations } from "@/components/buyer/RecentQuotations";
import { BuyerAccountStatus } from "@/components/buyer/BuyerAccountStatus";
import { BuyerActivityProgress } from "@/components/buyer/BuyerActivityProgress";
import { RecommendedSuppliers } from "@/components/buyer/RecommendedSuppliers";
import { BuyerQuickActions } from "@/components/buyer/BuyerQuickActions";
import { BuyerDashboardPromo } from "@/components/buyer/BuyerDashboardPromo";
import styles from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { getBuyerSettings } from "@/lib/buyer/settings";
import { getBuyerDashboardOverview } from "@/lib/buyer/dashboard";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no personal data in the metadata.
export const metadata: Metadata = { title: "Buyer Dashboard | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/dashboard. The buyer is the signed-in account, read on the server (an unauthenticated visitor is sent to sign-in and
 * returns here afterwards; a non-buyer account gets a clear message). Nothing in the address or any request names a buyer.
 * The data comes from lib/buyer/dashboard.ts, the same service as GET /api/buyer/dashboard, scoped to that account.
 */
async function BuyerDashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const query = await searchParams;
  const user = await requireBuyerPage("/buyer/dashboard");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={styles.accessNote} role="alert">
        <h1 className={styles.title}>Buyer accounts only</h1>
        <p className={styles.welcome}>The buyer dashboard is for buyer accounts. Sign out and sign in with a buyer account to see it.</p>
        <p>
          <Link href="/" className={styles.viewAll}>
            Back to Finbyn Mart
          </Link>
        </p>
      </div>
    );
  }

  // the saved dashboard period (Settings) applies only when the address names no range at all
  const namesRange = Boolean(one(query.range) || one(query.startDate) || one(query.endDate));
  const preferred = namesRange ? undefined : (await getBuyerSettings(user.id).catch(() => null))?.dashboardRange;
  const parsed = parseDashboardRange({ range: one(query.range) ?? preferred, startDate: one(query.startDate), endDate: one(query.endDate) });
  const fallback = parseDashboardRange({});
  const range = parsed.ok ? parsed.value : fallback.ok ? fallback.value : null;
  if (!range) throw new Error("default range failed");
  const overview = await getBuyerDashboardOverview(user.id, range);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const activeInquiries = overview.activity.status === "ok" ? overview.activity.data.activeInquiries : null;

  return (
    <BuyerShell userName={user.name} activeKey="dashboard" activeInquiries={activeInquiries}>
      <p className={styles.breadcrumb}>
        <Link href="/">Home</Link> / Buyer Dashboard
      </p>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Buyer Dashboard</h1>
          <p className={styles.welcome}>Welcome back, {firstName}! Here&apos;s your business activity overview on Finbyn Mart.</p>
        </div>
        <BuyerDashboardControls range={range.key} startDate={range.startDate} endDate={range.endDate} today={today} />
      </div>
      {!parsed.ok && (
        <p className={styles.errorBanner} role="alert">
          {parsed.error} Showing the last 30 days instead.
        </p>
      )}
      <p className={styles.legendNote} aria-live="polite">
        Showing {range.startDate} to {range.endDate} (India time) compared with the {range.days} days before.
      </p>
      <div className={styles.layout}>
        <div className={styles.main}>
          <BuyerStatsGrid section={overview.statistics} days={range.days} />
          <div className={styles.rowTwo}>
            <InquiryOrderTrend section={overview.trends} />
            <TopInquiryCategories section={overview.topInquiryCategories} />
          </div>
          <div className={styles.rowTables}>
            <RecentInquiries section={overview.recentInquiries} />
            <RecentQuotations section={overview.recentQuotations} />
          </div>
          <BuyerQuickActions />
          <BuyerDashboardPromo />
        </div>
        <aside className={styles.aside} aria-label="Account summary">
          <BuyerAccountStatus section={overview.accountStatus} />
          <BuyerActivityProgress section={overview.activity} />
          <RecommendedSuppliers section={overview.recommendedSuppliers} />
        </aside>
      </div>
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-dashboard", BuyerDashboardPage);
