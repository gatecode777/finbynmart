import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { InquiriesWorkspace, type Params } from "@/components/buyer/inquiries/InquiriesWorkspace";
import styles from "@/components/buyer/inquiries/Inquiries.module.css";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { getBuyerInquiryFacets, getBuyerInquirySummary, listBuyerInquiryPage } from "@/lib/inquiries/buyerList";
import { parseListQuery } from "@/lib/inquiries/buyerListRules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no inquiry data in the metadata.
export const metadata: Metadata = { title: "My Inquiries | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/inquiries?q=&status=&inquiryType=&supplierId=&categoryId=&range=&dateFrom=&dateTo=&sort=&page=
 * Identity from the session on the server; the first list, the summary and the filter choices are read here (each section on its own,
 * so one failing does not take the page down) and every later change goes through /api/buyer/inquiries. An invalid choice in the
 * address falls back to the defaults.
 */
async function BuyerInquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const user = await requireBuyerPage("/buyer/inquiries");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Inquiries are sent from buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }

  const flat = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)]));
  const parsed = parseListQuery(flat);
  const query = parsed.ok ? parsed.value : (() => { const d = parseListQuery({}); if (!d.ok) throw new Error("default list query failed"); return d.value; })();
  const params: Params = {
    q: query.q,
    status: query.status,
    inquiryType: query.inquiryType ?? "",
    supplierId: query.supplierId ?? "",
    categoryId: query.categoryId ?? "",
    range: query.window?.key ?? "",
    dateFrom: query.window?.key === "custom" ? query.window.startDate : "",
    dateTo: query.window?.key === "custom" ? query.window.endDate : "",
    sort: query.sort,
    page: query.page,
  };

  const [list, summary, facets, active] = await Promise.all([
    listBuyerInquiryPage(user.id, query).catch(() => null),
    getBuyerInquirySummary(user.id).catch(() => null),
    getBuyerInquiryFacets(user.id).catch(() => null),
    countActiveInquiries(user.id).catch(() => null),
  ]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <BuyerShell userName={user.name} activeKey="inquiries" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / My Inquiries
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>My Inquiries</h1>
          <p className={dash.welcome}>Track your supplier inquiries, monitor responses and manage your quotation requests.</p>
        </div>
        <Link href="/products" className={styles.cta}>
          <Plus size={18} aria-hidden /> Create New Inquiry
        </Link>
      </div>
      {list ? (
        <InquiriesWorkspace initial={list} initialParams={params} initialSummary={summary} initialFacets={facets} today={today} renderedAt={Date.now()} />
      ) : (
        <div className={dash.accessNote} role="alert">
          <h2 className={dash.cardTitle}>Your inquiries could not be loaded</h2>
          <p className={dash.welcome}>Nothing was changed. Please try again in a moment.</p>
          <p><Link href="/buyer/inquiries" className={dash.viewAll}>Try again</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-inquiries", BuyerInquiriesPage);
