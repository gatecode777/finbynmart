import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { SupplierCompareView } from "@/components/buyer/saved/SupplierCompareView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { compareSavedSuppliers } from "@/lib/wishlist/savedSuppliers";
import { COMPARE_MAX, COMPARE_MIN, parseSupplierKeys } from "@/lib/wishlist/savedSuppliersRules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no supplier names in the metadata.
export const metadata: Metadata = { title: "Compare Suppliers | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/compare-suppliers?ids=a,b,c: two to four of the buyer's own saved suppliers, side by side. Choosing them changes nothing.
 * A supplier the buyer has not saved (or that is no longer listed) ends in the same 404 as anywhere else.
 */
async function BuyerCompareSuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const user = await requireBuyerPage("/buyer/saved-suppliers");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const rawIds = Array.isArray(query.ids) ? query.ids[0] : query.ids;
  const keys = parseSupplierKeys((rawIds ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10), COMPARE_MIN, COMPARE_MAX);
  const [result, active] = await Promise.all([keys.ok ? compareSavedSuppliers(user.id, keys.keys).catch(() => null) : Promise.resolve(null), countActiveInquiries(user.id).catch(() => null)]);
  if (result && !result.ok && result.code === "NOT_FOUND") notFound();

  return (
    <BuyerShell userName={user.name} activeKey="saved-suppliers" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/saved-suppliers">Saved Suppliers</Link> / Compare
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Compare Suppliers</h1>
          <p className={dash.welcome}>Set your saved suppliers side by side. Comparing does not change anything.</p>
        </div>
      </div>
      {result && result.ok ? (
        <SupplierCompareView data={result.value} />
      ) : (
        <div className={dash.accessNote} role="status">
          <h2 className={dash.cardTitle}>{keys.ok ? (result ? "These suppliers cannot be compared" : "The comparison could not be loaded") : "Choose suppliers to compare"}</h2>
          <p className={dash.welcome}>{keys.ok ? (result && !result.ok ? result.message : "Nothing was changed. Please try again.") : `Select between ${COMPARE_MIN} and ${COMPARE_MAX} of your saved suppliers, then choose Compare Selected.`}</p>
          <p><Link href="/buyer/saved-suppliers" className={dash.viewAll}>Back to Saved Suppliers</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-compare-suppliers", BuyerCompareSuppliersPage);
