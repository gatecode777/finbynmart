import type { Metadata } from "next";
import Link from "next/link";
import { SupplierInboxWorkspace } from "@/components/supplier/inquiries/SupplierInboxWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { listSupplierInbox } from "@/lib/supplier/inquiryListService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Inquiries & Leads | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function SupplierInquiriesPage() {
  const { context } = await requireSupplierPage("/supplier/inquiries");
  const initial = await listSupplierInbox(context, {});
  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/dashboard">Supplier</Link> / Inquiries &amp; Leads
      </p>
      <h1 className={dash.title}>Inquiries &amp; Leads</h1>
      <p className={dash.welcome}>Every inquiry buyers have sent to your sellers.</p>
      <SupplierInboxWorkspace initial={initial} canView={context.permissions.viewInquiries} />
    </div>
  );
}

export default withPagePerf("page supplier-inquiries", SupplierInquiriesPage);
