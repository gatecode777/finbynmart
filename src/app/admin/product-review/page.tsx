import type { Metadata } from "next";
import Link from "next/link";
import { ProductReviewWorkspace } from "@/components/admin/ProductReviewWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Product Review | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductReviewPage() {
  await requireAdminPage("/admin/product-review", "products.review");
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Product review</p>
      <h1 className={styles.heading}>Product Review</h1>
      <p className={styles.lead}>Approve or reject the exact revision a supplier submitted.</p>
      <ProductReviewWorkspace />
    </div>
  );
}
