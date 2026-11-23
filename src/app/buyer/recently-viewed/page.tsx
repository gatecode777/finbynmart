import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { RecentlyViewedWorkspace } from "@/components/buyer/recent/RecentlyViewedWorkspace";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { listRecent } from "@/lib/recentlyViewed/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no product names in the metadata.
export const metadata: Metadata = { title: "Recently Viewed | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/recently-viewed : the signed-in buyer's own product-view history. The buyer comes from the session on the server. Opening this page records nothing; views are recorded
 * only by the product page after it has displayed a real public product. A failed read renders the Retry state, never an empty history.
 */
async function BuyerRecentlyViewedPage() {
  const user = await requireBuyerPage("/buyer/recently-viewed");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Recently viewed products belong to buyer accounts.</p>
        <p><Link prefetch={false} href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const [initial, active] = await Promise.all([listRecent(user.id, null).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);
  return (
    <BuyerShell userName={user.name} activeKey="recently-viewed" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/">Home</Link> / <Link prefetch={false} href="/buyer/dashboard">Buyer</Link> / Recently Viewed
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Recently Viewed</h1>
          <p className={dash.welcome}>Pick up where you left off.</p>
        </div>
      </div>
      <RecentlyViewedWorkspace initial={initial} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-recently-viewed", BuyerRecentlyViewedPage);
