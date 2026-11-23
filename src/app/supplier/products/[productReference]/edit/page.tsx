import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductDraftForm } from "@/components/supplier/products/ProductDraftForm";
import { Info } from "lucide-react";
import s from "@/components/supplier/products/ProductDraftForm.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getDraft, selectableCategories } from "@/lib/supplier/productDraftService";

export const metadata: Metadata = { title: "Edit Product | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ productReference: string }> }) {
  const { productReference } = await params;
  const { context } = await requireSupplierPage(`/supplier/products/${encodeURIComponent(productReference)}/edit`);
  if (!context.permissions.manageProducts) redirect("/forbidden?portal=supplier");
  // identical 404 for malformed, unknown, foreign, catalogue and non-draft references
  const draft = await getDraft(context, productReference);
  if (!draft) notFound();

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/products">My Products</Link> / {draft.input.name || "Untitled"} / Edit
      </p>
      <h1 className={dash.title}>Edit Product</h1>
      <div className={s.chips}>
        {draft.input.sku && <span className={s.chip}>SKU: {draft.input.sku}</span>}
        <span className={s.chip}>Private draft · not published</span>
      </div>
      <p className={s.banner}>
        <Info size={18} aria-hidden /> This product has no live listing. Changes here stay in your private draft until a publishing workflow exists.
      </p>
      <ProductDraftForm mode="edit" categories={selectableCategories()} initial={draft} />
    </div>
  );
}
