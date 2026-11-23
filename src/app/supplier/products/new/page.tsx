import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductDraftForm } from "@/components/supplier/products/ProductDraftForm";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getDraft, selectableCategories } from "@/lib/supplier/productDraftService";

export const metadata: Metadata = { title: "Add Product | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AddProductPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft: ref } = await searchParams;
  const { context } = await requireSupplierPage(ref ? `/supplier/products/new?draft=${encodeURIComponent(ref)}` : "/supplier/products/new");
  if (!context.permissions.manageProducts) redirect("/forbidden?portal=supplier");
  const draft = ref ? await getDraft(context, ref) : null;
  if (ref && !draft) notFound();

  return (
    <div className={dash.page} style={{ position: "relative" }}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/products">My Products</Link> / Add Product
      </p>
      <h1 className={dash.title}>Add Product</h1>
      <p className={dash.welcome}>Create a clear and accurate product listing.</p>
      <ProductDraftForm categories={selectableCategories()} initial={draft} />
    </div>
  );
}
