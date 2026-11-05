import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { SavedProductsWorkspace, type SavedParams } from "@/components/buyer/saved/SavedProductsWorkspace";
import inquiries from "@/components/buyer/inquiries/Inquiries.module.css";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { listSavedProducts } from "@/lib/wishlist/savedProducts";
import { parseSavedQuery } from "@/lib/wishlist/savedProductsRules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no product names in the metadata.
export const metadata: Metadata = { title: "Saved Products | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/saved-products?q=&category=&sort=&page=
 * Identity from the session on the server; the first page is read here and every later change goes through /api/buyer/saved-products.
 * An invalid choice in the address falls back to the defaults.
 */
async function BuyerSavedProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const user = await requireBuyerPage("/buyer/saved-products");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Saved products belong to buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }

  const parsed = parseSavedQuery(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)])));
  const query = parsed.ok ? parsed.value : (() => { const d = parseSavedQuery({}); if (!d.ok) throw new Error("default saved query failed"); return d.value; })();
  const params: SavedParams = { q: query.q, category: query.category ?? "", sort: query.sort, page: query.page };
  const [list, active] = await Promise.all([listSavedProducts(user.id, query).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);

  return (
    <BuyerShell userName={user.name} activeKey="saved-products" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Saved Products
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Saved Products</h1>
          <p className={dash.welcome}>Your shortlisted products for easy access and inquiries.</p>
        </div>
        <Link href="/products" className={inquiries.cta}>
          <Plus size={18} aria-hidden /> Add More Products
        </Link>
      </div>
      {list ? (
        <SavedProductsWorkspace initial={list} initialParams={params} renderedAt={Date.now()} />
      ) : (
        <div className={dash.accessNote} role="alert">
          <h2 className={dash.cardTitle}>Your saved products could not be loaded</h2>
          <p className={dash.welcome}>Nothing was changed. Please try again in a moment.</p>
          <p><Link href="/buyer/saved-products" className={dash.viewAll}>Try again</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-saved-products", BuyerSavedProductsPage);
