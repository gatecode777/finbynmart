import type { Metadata } from "next";
import Link from "next/link";
import { CompanyLinksWorkspace } from "@/components/admin/CompanyLinksWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Company Links | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CompanyLinksPage() {
  await requireAdminPage("/admin/company-links", "sellers.map");
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/inquiries">Admin</Link> / Company links</p>
      <h1 className={styles.heading}>Company Links</h1>
      <p className={styles.lead}>Link a catalogue seller to the supplier company that owns it, after reviewing ownership evidence.</p>
      <CompanyLinksWorkspace />
    </div>
  );
}
