import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { QuotationDetailView, TABS, type TabKey } from "@/components/buyer/quotations/QuotationDetailView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { REFERENCE_PATTERN } from "@/lib/quotations/quotationRules";
import { getBuyerQuotationDetail } from "@/lib/quotations/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no prices or names in the metadata.
export const metadata: Metadata = { title: "Quotation Details | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/quotations/<reference>?version=N&tab=details|compare|history|inquiry|messages.
 * The reference only names the quotation; the session decides. Another buyer's, an unknown, a draft and a malformed reference all end
 * in the same 404. No loading.tsx above this page: it can 404 and redirect.
 */
async function BuyerQuotationPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reference } = await params;
  const query = await searchParams;
  const user = await requireBuyerPage(`/buyer/quotations/${REFERENCE_PATTERN.test(reference) ? reference : ""}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Quotations belong to buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  if (!REFERENCE_PATTERN.test(reference)) notFound();
  const rawVersion = one(query.version);
  const version = rawVersion === undefined ? undefined : Number(rawVersion);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) notFound();
  const tab: TabKey = TABS.find((t) => t.key === one(query.tab))?.key ?? "details";

  const [detail, active] = await Promise.all([getBuyerQuotationDetail(user.id, reference, version), countActiveInquiries(user.id).catch(() => null)]);
  if (!detail) notFound();

  return (
    <BuyerShell userName={user.name} activeKey="quotations" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/quotations">Quotations</Link> / {detail.quotation.reference}
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Quotation Details &amp; Comparison</h1>
          <p className={dash.welcome}>View complete quotation details, compare supplier offers, manage revisions and take an informed business decision.</p>
        </div>
      </div>
      <QuotationDetailView data={detail} tab={tab} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-quotation-detail", BuyerQuotationPage);
