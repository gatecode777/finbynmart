import type { Metadata } from "next";
import Link from "next/link";
import { SupplierProductsWorkspace } from "@/components/supplier/products/SupplierProductsWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getSupplierProducts } from "@/lib/supplier/productService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "My Products | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function SupplierProductsPage() {
  const { context } = await requireSupplierPage("/supplier/products");
  const initial = await getSupplierProducts(context, { limit: 15 });

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/dashboard">Supplier</Link> / My Products
      </p>

      <div className={dash.headerRow}>
        <div>
          <h1 className={dash.title}>My Products</h1>
          <p className={dash.welcome}>
            Manage your product catalogue, pricing, specifications, and listings active across the marketplace.
          </p>
        </div>
      </div>

      <SupplierProductsWorkspace initial={initial} />
    </div>
  );
}

export default withPagePerf("page supplier-products", SupplierProductsPage);
