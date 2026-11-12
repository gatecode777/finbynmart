import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Info } from "lucide-react";
import { OrderStatusBadge } from "@/components/supplier/orders/OrderStatusBadge";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import q from "@/components/supplier/quotations/SupplierQuotations.module.css";
import styles from "@/components/supplier/orders/SupplierOrders.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { getSupplierOrderDetail } from "@/lib/supplier/orderService";

export const metadata: Metadata = { title: "Order Details | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /supplier/orders/<reference>: ONE order of the session's company, read only (the compact detail the list's View action opens; there is deliberately no
 * loading.tsx above it, because it can answer 404 or redirect). An unknown, malformed or another supplier's reference is the same real 404 and nothing is
 * read before the company is known. Items and amounts are the order's own stored snapshot. No action changes the order: no supplier order workflow exists.
 */
async function SupplierOrderDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { context } = await requireSupplierPage(`/supplier/orders/${encodeURIComponent(reference)}`);
  if (!context.permissions.viewOrders) redirect("/forbidden?portal=supplier");
  const d = await getSupplierOrderDetail(context, reference);
  if (!d) notFound();
  const o = d.order;
  const reasons = [d.capabilities.confirm.reason, d.capabilities.payments.reason];

  return (
    <div className={dash.page}>
      <p className={`${dash.breadcrumb} ${styles.noPrint}`}>
        <Link href="/supplier/dashboard">Supplier</Link> / <Link href="/supplier/orders">Orders</Link> / {o.reference}
      </p>
      <div className={dash.header}>
        <div>
          <h1 className={dash.title}>Order {o.reference}</h1>
          <p className={dash.welcome} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
            <OrderStatusBadge group={o.statusGroup} label={o.statusLabel} />
            <span>Placed {o.placedLabel}</span>
          </p>
        </div>
        <div className={`${q.headerActions} ${styles.noPrint}`}>
          <Link href="/supplier/orders" className={dash.btn}>Back to orders</Link>
        </div>
      </div>

      {d.cancellationRequest && (
        <p className={q.banner} role="status">
          The buyer asked to cancel this order on {d.cancellationRequest.atLabel} (it was {d.cancellationRequest.previousStatusLabel} then). Their reason is under Order history. Accepting or declining a cancellation request is not available here: no supplier order workflow exists yet, so the order stays as recorded.
        </p>
      )}

      <div className={styles.detailLayout}>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <section className={dash.card} aria-labelledby="od-items">
            <h2 id="od-items" className={dash.cardTitle}>Items ordered</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {d.items.map((i, n) => (
                <li key={`${i.name}-${n}`} className={styles.itemRow}>
                  <span className={styles.itemName}>{i.productUrl ? <Link href={i.productUrl} className={q.link}>{i.name}</Link> : i.name}</span>
                  <span className={q.small}>Quantity {i.quantityText}</span>
                  <span className={q.small}>Agreed unit price {i.unitPrice}</span>
                </li>
              ))}
            </ul>
            {d.order.itemCount > d.itemsShown && <p className={q.small}>Showing the first {d.itemsShown} of {d.order.itemCount.toLocaleString("en-IN")} items.</p>}
            <p className={q.small}>Names, quantities and prices are what the order was placed with. They do not change if the catalogue changes.</p>
          </section>

          <section className={dash.card} aria-labelledby="od-history">
            <h2 id="od-history" className={dash.cardTitle}>Order history</h2>
            {d.events.length === 0 ? (
              <p className={q.small}>No history is recorded for this order.</p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {[...d.events].reverse().map((e, n) => (
                  <li key={`${e.label}-${n}`} className={styles.historyItem}>
                    <strong>{e.label}</strong>
                    <span className={q.small}>{e.actor} · {e.atLabel}</span>
                    {e.reason && <p className={styles.historyReason}>Reason given: {e.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <section className={dash.card} aria-labelledby="od-summary">
            <h2 id="od-summary" className={dash.cardTitle}>Order summary</h2>
            <dl className={q.facts}>
              <div><dt>Buyer</dt><dd className={styles.buyerCell}>{d.buyer}</dd></div>
              <div><dt>Order amount</dt><dd><span className={q.amount}>{o.amount.text}</span> ({o.amount.currency}, as stored)</dd></div>
              <div><dt>Order status</dt><dd>{o.statusLabel}</dd></div>
              <div><dt>Fulfilment</dt><dd>{o.fulfilment}</dd></div>
              <div><dt>Payment</dt><dd>{d.payment.label}</dd></div>
              <div><dt>Items</dt><dd>{o.itemCount.toLocaleString("en-IN")}</dd></div>
              {o.expectedDelivery && <div><dt>Expected delivery</dt><dd>{o.expectedDelivery.label} ({o.expectedDelivery.source})</dd></div>}
              <div><dt>Last updated</dt><dd>{o.updatedLabel}</dd></div>
              {d.quotation && <div><dt>Quotation</dt><dd>{d.quotation.href ? <Link href={d.quotation.href} className={q.link}>{d.quotation.reference}</Link> : d.quotation.reference}</dd></div>}
              {d.inquiry && <div><dt>Inquiry</dt><dd>{d.inquiry.href ? <Link href={d.inquiry.href} className={q.link}>{d.inquiry.reference}</Link> : d.inquiry.reference}</dd></div>}
            </dl>
          </section>

          <section className={`${dash.card} ${styles.noPrint}`} aria-labelledby="od-na">
            <h2 id="od-na" className={dash.cardTitle}>Not available yet</h2>
            <ul className={q.pendingList}>
              {reasons.map((r) => <li key={r}><Info size={14} aria-hidden /> {r}</li>)}
              <li><Info size={14} aria-hidden /> Shipment tracking, stock reservation and invoices do not exist, so none is shown.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default withPagePerf("page supplier-order-detail", SupplierOrderDetailPage);
