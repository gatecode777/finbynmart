import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { QuotationsWorkspace, type QuotationParams } from "@/components/buyer/quotations/QuotationsWorkspace";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { parseQuotationQuery } from "@/lib/quotations/quotationRules";
import { listBuyerQuotations } from "@/lib/quotations/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no prices in the metadata.
export const metadata: Metadata = { title: "My Quotations | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** /buyer/quotations?q=&status=&sort=&page=: identity from the session; the first page is read here, later changes go through /api/buyer/quotations. */
async function BuyerQuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const user = await requireBuyerPage("/buyer/quotations");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Quotations belong to buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  const parsed = parseQuotationQuery(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)])));
  const query = parsed.ok ? parsed.value : (() => { const d = parseQuotationQuery({}); if (!d.ok) throw new Error("default quotation query failed"); return d.value; })();
  const params: QuotationParams = { q: query.q, status: query.status, sort: query.sort, page: query.page };
  const [list, active] = await Promise.all([listBuyerQuotations(user.id, query).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);

  return (
    <BuyerShell userName={user.name} activeKey="quotations" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Quotations
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>My Quotations</h1>
          <p className={dash.welcome}>View, compare and manage all quotations received from suppliers.</p>
        </div>
      </div>
      {list ? (
        <QuotationsWorkspace initial={list} initialParams={params} renderedAt={Date.now()} />
      ) : (
        <div className={dash.accessNote} role="alert">
          <h2 className={dash.cardTitle}>Your quotations could not be loaded</h2>
          <p className={dash.welcome}>Nothing was changed. Please try again in a moment.</p>
          <p><Link href="/buyer/quotations" className={dash.viewAll}>Try again</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-quotations", BuyerQuotationsPage);
