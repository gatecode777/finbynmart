import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { OrderDetailView } from "@/components/buyer/orders/OrderDetailView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { REFERENCE_PATTERN } from "@/lib/orders/orderRules";
import { getBuyerOrderDetail } from "@/lib/orders/service";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no order data in the metadata.
export const metadata: Metadata = { title: "Order Details | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/orders/<reference>. The reference only names the order; the session decides. Another buyer's, an unknown and a malformed
 * reference all end in the same 404. No loading.tsx above this page: it can 404 and redirect.
 */
async function BuyerOrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const user = await requireBuyerPage(`/buyer/orders/${REFERENCE_PATTERN.test(reference) ? reference : ""}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Orders belong to buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  if (!REFERENCE_PATTERN.test(reference)) notFound();
  const [detail, active] = await Promise.all([getBuyerOrderDetail(user.id, reference), countActiveInquiries(user.id).catch(() => null)]);
  if (!detail) notFound();

  return (
    <BuyerShell userName={user.name} activeKey="orders" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/orders">Orders</Link> / {detail.order.reference}
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Order Details</h1>
          <p className={dash.welcome}>What was ordered, the agreed amount and everything recorded about this order.</p>
        </div>
      </div>
      <OrderDetailView data={detail} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-order-detail", BuyerOrderPage);
