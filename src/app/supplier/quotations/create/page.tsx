import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InquiryPicker } from "@/components/supplier/quotations/create/InquiryPicker";
import { QuoteBuilder } from "@/components/supplier/quotations/create/QuoteBuilder";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "@/components/supplier/quotations/create/QuoteBuilder.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { PICKER_PAGE_SIZE, getDraft, getQuotationContext, listQuotableInquiries } from "@/lib/supplier/quoteService";

export const metadata: Metadata = { title: "Create Quotation | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /supplier/quotations/create : with no parameter, the picker of inquiries this company may quote; with ?inquiryReference=, the form for that inquiry
 * (untrusted input: it is looked up inside the company's own inquiries, so an unknown, malformed or another seller's reference is the same 404); with
 * ?reference=, the company's own draft to continue (a submitted one goes to its detail page). The layout already proved a supplier with an active company.
 * There is deliberately no loading.tsx above this page: it can 404 and redirect.
 */
async function CreateQuotationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const { context } = await requireSupplierPage("/supplier/quotations/create");
  const draftRef = one(raw.reference);
  const inquiryRef = one(raw.inquiryReference);

  const crumbs = (
    <p className={dash.breadcrumb}>
      <Link href="/">Home</Link> / Supplier Portal / <Link href="/supplier/quotations">Quotations</Link> / Create Quotation
    </p>
  );

  if (draftRef) {
    const result = await getDraft(context, draftRef.trim().toUpperCase());
    if (!result.ok) {
      if (result.code === "NOT_A_DRAFT") redirect(`/supplier/quotations/${draftRef.trim().toUpperCase()}`);
      notFound();
    }
    const d = result.draft;
    return (
      <div className={dash.page}>
        {crumbs}
        <QuoteBuilder
          inquiry={d.inquiry}
          options={d.options}
          supplier={d.supplier}
          capabilities={d.capabilities}
          eligible={d.eligible}
          ineligibleReason={d.ineligibleReason}
          initialInput={d.input}
          draft={{ reference: d.reference, revision: d.revision, savedLabel: d.savedLabel, version: d.version, revisionOf: d.revisionOf, revisionReason: d.revisionReason }}
        />
      </div>
    );
  }

  if (inquiryRef) {
    const ctx = await getQuotationContext(context, inquiryRef.trim().toUpperCase());
    if (!ctx) notFound();
    // an open draft for this inquiry is continued, never duplicated; a submitted quotation is shown
    if (ctx.existing?.status === "DRAFT") redirect(`/supplier/quotations/create?reference=${ctx.existing.reference}`);
    if (ctx.existing) redirect(`/supplier/quotations/${ctx.existing.reference}`);
    if (!ctx.eligible) {
      return (
        <div className={dash.page}>
          {crumbs}
          <div className={dash.header}>
            <div>
              <h1 className={dash.title}>Create Quotation</h1>
              <p className={dash.welcome}>Prepare your offer for the buyer</p>
            </div>
          </div>
          <p className={`${styles.banner} ${styles.bannerError}`} role="alert">{ctx.ineligibleReason}</p>
          <p><Link href="/supplier/quotations/create" className={dash.btn}>Choose another inquiry</Link></p>
        </div>
      );
    }
    return (
      <div className={dash.page}>
        {crumbs}
        <QuoteBuilder inquiry={ctx.inquiry} options={ctx.options} supplier={ctx.supplier} capabilities={ctx.capabilities} eligible ineligibleReason={null} initialInput={ctx.defaults} draft={null} />
      </div>
    );
  }

  const initial = await listQuotableInquiries(context, { q: "", page: 1, limit: PICKER_PAGE_SIZE });
  return (
    <div className={dash.page}>
      {crumbs}
      <div className={dash.header}>
        <div>
          <h1 className={dash.title}>Create Quotation</h1>
          <p className={dash.welcome}>Prepare your offer for the buyer</p>
        </div>
      </div>
      <InquiryPicker initial={initial} />
    </div>
  );
}

export default withPagePerf("page supplier-quotation-create", CreateQuotationPage);
