import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { CompareView } from "@/components/buyer/quotations/CompareView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { COMPARE_MAX, COMPARE_MIN, REFERENCE_PATTERN } from "@/lib/quotations/quotationRules";
import { compareBuyerQuotations } from "@/lib/quotations/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached.
export const metadata: Metadata = { title: "Compare Quotations | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/quotations/compare?refs=A,B,C: two to four of the buyer's own current quotations for one inquiry, side by side. Choosing them
 * changes nothing. A reference that is not the buyer's (or does not exist) ends in the same 404 as anywhere else.
 */
async function BuyerQuotationComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const user = await requireBuyerPage("/buyer/quotations");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const rawRefs = Array.isArray(query.refs) ? query.refs[0] : query.refs;
  const refs = (rawRefs ?? "").split(",").map((r) => r.trim()).filter(Boolean).slice(0, 10);
  const invalid = refs.some((r) => !REFERENCE_PATTERN.test(r));
  const [result, active] = await Promise.all([!invalid && refs.length > 0 ? compareBuyerQuotations(user.id, refs).catch(() => null) : Promise.resolve(null), countActiveInquiries(user.id).catch(() => null)]);
  if (result && !result.ok && result.code === "NOT_FOUND") notFound();

  return (
    <BuyerShell userName={user.name} activeKey="quotations" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/quotations">Quotations</Link> / Compare
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Compare Quotations</h1>
          <p className={dash.welcome}>Set supplier offers for the same inquiry side by side. Comparing does not accept or change anything.</p>
        </div>
      </div>
      {result && result.ok ? (
        <CompareView data={result.value} />
      ) : (
        <div className={dash.accessNote} role="status">
          <h2 className={dash.cardTitle}>{invalid || refs.length === 0 ? "Choose quotations to compare" : result ? "These quotations cannot be compared" : "The comparison could not be loaded"}</h2>
          <p className={dash.welcome}>
            {invalid || refs.length === 0 ? `Tick between ${COMPARE_MIN} and ${COMPARE_MAX} quotations of the same inquiry in your quotations list, then choose Compare Selected.` : result && !result.ok ? result.message : "Nothing was changed. Please try again."}
          </p>
          <p><Link href="/buyer/quotations" className={dash.viewAll}>Back to Quotations</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-quotation-compare", BuyerQuotationComparePage);
