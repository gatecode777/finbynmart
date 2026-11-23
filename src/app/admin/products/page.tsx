import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminProductsWorkspace } from "@/components/admin/AdminProductsWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Products | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Admin Product Management (frontend). Guarded by the products.read capability; the list, detail, unpublish and export APIs re-check their own capabilities. Demo records exist only for a local preview: an authenticated admin in a NON-production build opening ?preview=demo (never in production).
 */
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { permissions } = await requireAdminPage("/admin/products", "products.read");
  const sp = await searchParams;
  const demo = process.env.NODE_ENV !== "production" && sp.preview === "demo";
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link prefetch={false} href="/admin/dashboard">Admin</Link> / Products</p>
      <h1 className={styles.heading}>Product Management</h1>
      <p className={styles.lead}>Manage product listings and public visibility. Review decisions stay in Product Review.</p>
      <Suspense fallback={<p>Loading products...</p>}>
        <AdminProductsWorkspace demo={demo} canExport={permissions.includes("products.export")} canReview={permissions.includes("products.review")} />
      </Suspense>
    </div>
  );
}
