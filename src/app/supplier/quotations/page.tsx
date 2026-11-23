import type { Metadata } from "next";
import Link from "next/link";
import { SupplierQuotationsWorkspace, type QuotationParams } from "@/components/supplier/quotations/SupplierQuotationsWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { parseSupplierQuery } from "@/lib/supplier/quotationRules";
import { listSupplierQuotations } from "@/lib/supplier/quotationService";
import { retryPendingNotices } from "@/lib/supplier/outbox";

export const metadata: Metadata = { title: "Quotations | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /supplier/quotations: the supplier's quotation workspace. The layout already proved a supplier with an active company; the company used here is the
 * one the session's account owns, never anything from the address. An invalid filter in the address falls back to the defaults (the API itself rejects
 * it with 400). Only the first page is read here; every later change goes through /api/supplier/quotations.
 */
async function SupplierQuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const { context } = await requireSupplierPage("/supplier/quotations");
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  const parsed = parseSupplierQuery(flat);
  const valid = parsed.ok;
  const query = valid ? parsed.value : (() => { const d = parseSupplierQuery({}); if (!d.ok) throw new Error("default query failed"); return d.value; })();
  // a notice that was not delivered right after a submission (a crash between commit and delivery) is picked up here, in parallel with the list
  const [page] = await Promise.all([listSupplierQuotations(context, query), retryPendingNotices(context).catch(() => 0)]);
  const initialParams: QuotationParams = valid
    ? {
        q: query.q,
        status: query.status,
        sort: query.sort,
        range: query.rangeKey === "all" ? "" : query.rangeKey,
        startDate: query.rangeKey === "custom" ? (flat.startDate ?? "") : "",
        endDate: query.rangeKey === "custom" ? (flat.endDate ?? "") : "",
        dateBasis: query.dateBasis,
        validity: query.validity ?? "",
        currency: query.currency ?? "",
        page: query.page,
      }
    : { q: "", status: "all", sort: "newest", range: "", startDate: "", endDate: "", dateBasis: "created", validity: "", currency: "", page: 1 };

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/">Home</Link> / Supplier Portal / Quotations
      </p>
      <SupplierQuotationsWorkspace initial={page} initialParams={initialParams} renderedAt={Date.now()} />
    </div>
  );
}

export default withPagePerf("page supplier-quotations", SupplierQuotationsPage);
