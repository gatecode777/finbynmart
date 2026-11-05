import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { CompareProductsView } from "@/components/buyer/compare/CompareProductsView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { getProductComparison } from "@/lib/compare/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no product names in the metadata.
export const metadata: Metadata = { title: "Compare Products | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** /buyer/compare-products (was /buyer/compare, which redirects here): the signed-in buyer's own list of up to four products, side by side. Identity from the session only. */
async function BuyerComparePage() {
  const user = await requireBuyerPage("/buyer/compare-products");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Product comparison belongs to buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const [data, active] = await Promise.all([getProductComparison(user.id).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);

  return (
    <BuyerShell userName={user.name} activeKey="compare" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Compare Products
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Compare Products{data ? ` (${data.columns.length})` : ""}</h1>
          <p className={dash.welcome}>Compare product specifications, pricing, availability and supplier details to choose the right option for your business.</p>
        </div>
      </div>
      {data ? (
        <CompareProductsView data={data} />
      ) : (
        <div className={dash.accessNote} role="alert">
          <h2 className={dash.cardTitle}>Your comparison could not be loaded</h2>
          <p className={dash.welcome}>Nothing was changed. Please try again in a moment.</p>
          <p><Link href="/buyer/compare-products" className={dash.viewAll}>Try again</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-compare", BuyerComparePage);
