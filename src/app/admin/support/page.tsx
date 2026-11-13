import type { Metadata } from "next";
import Link from "next/link";
import { SupportStaffWorkspace } from "@/components/admin/SupportStaffWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Support | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdminPage("/admin/support", "support.manage");
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/inquiries">Admin</Link> / Support</p>
      <h1 className={styles.heading}>Support Tickets</h1>
      <p className={styles.lead}>Read tickets, reply publicly and keep internal notes.</p>
      <SupportStaffWorkspace />
    </div>
  );
}
