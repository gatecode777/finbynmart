import type { Metadata } from "next";
import Link from "next/link";
import { AdminInquiriesWorkspace } from "@/components/admin/AdminInquiriesWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listAdminInquiries } from "@/lib/admin/inquiryService";
import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Inquiry Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function AdminInquiriesPage() {
  const { permissions } = await requireAdminPage("/admin/inquiries", "inquiries.read");
  const d = defaultRange();
  const parsed = parseRange(d.startDay, d.endDay);
  if (!parsed.ok) throw new Error("default range invalid");
  const initial = await listAdminInquiries({ range: parsed.range });

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/admin/inquiries">Admin</Link> / Inquiries
      </p>
      <h1 className={styles.heading}>Inquiry Management</h1>
      <p className={styles.lead}>Review and coordinate marketplace inquiries.</p>
      <AdminInquiriesWorkspace initial={initial} range={d} canExport={permissions.includes("inquiries.export")} />
    </div>
  );
}

export default withPagePerf("page admin-inquiries", AdminInquiriesPage);
