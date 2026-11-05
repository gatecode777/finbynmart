import Image from "next/image";
import Link from "next/link";
import { CircleAlert, ListChecks, Package, ReceiptText } from "lucide-react";
import type { OrderDetail } from "@/lib/orders/service";
import d from "../inquiries/detail/InquiryDetail.module.css";
import { OrderActions } from "./OrderActions";
import { OrderStatusPill } from "./OrderStatusPill";
import styles from "./Orders.module.css";

/**
 * One order, from what the database holds. This is the compact order page that the list links to (the full Page 32 PRD has not been
 * sent): items as ordered, the agreed amount, the supplier, the recorded event history and where the order came from. Payments,
 * invoices, shipment tracking, returns and addresses have no module or no saved data, so the page says so; nothing is invented.
 */
export function OrderDetailView({ data: x }: { data: OrderDetail }) {
  const o = x.order;
  return (
    <>
      <OrderActions target={{ reference: o.reference, supplierName: x.supplier.name, statusLabel: o.statusLabel }} canRequestCancellation={x.capabilities.cancellationRequest} />

      {x.cancellationRequest && (
        <p className={styles.notice} role="status">
          <CircleAlert size={16} aria-hidden /> You asked to cancel this order on {x.cancellationRequest.atLabel} (it was {x.cancellationRequest.previousStatusLabel}): {x.cancellationRequest.reason}. It is not cancelled yet: the supplier has to agree, and the supplier is not notified automatically.
        </p>
      )}

      <div className={d.grid}>
        <div className={d.main}>
          <section className={d.card} aria-labelledby="order-summary-title">
            <div className={d.overview}>
              <span className={d.thumb} aria-hidden>{x.items[0].imageSrc ? <Image src={x.items[0].imageSrc} alt="" width={120} height={120} unoptimized={x.items[0].imageRemote} /> : <Package size={40} />}</span>
              <div className={d.overviewText}>
                <p className={d.refBadge}>Order Reference</p>
                <h2 id="order-summary-title" className={`${d.reference} ${styles.wrap}`}>{o.reference}</h2>
                <p className={d.muted}>{x.supplier.url ? <Link href={x.supplier.url} className={d.link}>{x.supplier.name}</Link> : x.supplier.name}{x.supplier.location ? ` · ${x.supplier.location}` : ""}</p>
                {o.quotation && <p className={d.muted}>From quotation <Link href={o.quotation.href} className={d.link}>{o.quotation.reference}</Link></p>}
                {o.inquiry && <p className={d.muted}>Inquiry <Link href={o.inquiry.href} className={d.link}>{o.inquiry.reference}</Link></p>}
              </div>
              <dl className={d.dates}>
                <div><dt>Placed On</dt><dd><time dateTime={o.placedAt}>{o.placedLabel}</time></dd></div>
                <div><dt>Last Updated</dt><dd>{o.updatedLabel}</dd></div>
                <div><dt>Delivery</dt><dd>{o.deliveryLabel}</dd></div>
                <div><dt>Expected Delivery</dt><dd>{o.expectedDelivery ? <>{o.expectedDelivery.label} <span className={d.muted}>({o.expectedDelivery.source})</span></> : "Not Available"}</dd></div>
              </dl>
              <div className={d.statusBox}>
                <p className={d.muted}>Order Status</p>
                <OrderStatusPill status={o.status} group={o.statusGroup} label={o.statusLabel} />
              </div>
            </div>
          </section>

          <section className={d.card} aria-labelledby="order-items-title">
            <h2 id="order-items-title" className={d.cardTitle}><Package size={20} aria-hidden /> Items Ordered ({o.itemCount})</h2>
            <ul className={styles.itemList}>
              {x.items.map((i, n) => (
                <li key={`${i.name}-${n}`}>
                  <span className={d.thumb} aria-hidden>{i.imageSrc ? <Image src={i.imageSrc} alt="" width={64} height={64} unoptimized={i.imageRemote} /> : <Package size={24} />}</span>
                  <span className={styles.itemText}>
                    <span className={d.productName}>{i.url ? <Link href={i.url} className={d.link}>{i.name}</Link> : i.name}</span>
                    <span>{i.quantityText} at {i.unitPrice}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.totalLine}>Order Amount: {o.amount.text}<span className={styles.small}>{o.amount.currency}, the total agreed for this order. Items and prices are what the order was placed with, not today&apos;s catalogue.</span></p>
          </section>

          <section className={d.card} aria-labelledby="order-activity-title">
            <h2 id="order-activity-title" className={d.cardTitle}><ListChecks size={20} aria-hidden /> Order Activity</h2>
            <ul className={styles.eventList}>
              {x.events.map((e, n) => (
                <li key={`${e.type}-${n}`}>
                  <strong>{e.label}</strong>
                  <span className={d.muted}>{e.atLabel} · {e.actor}{e.reason ? ` · ${e.reason}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className={d.side}>
          <section className={d.card} aria-labelledby="order-unavailable-title">
            <h2 id="order-unavailable-title" className={d.cardTitle}><ReceiptText size={20} aria-hidden /> Not Available Yet</h2>
            <p className={d.muted}>Payments, invoices, shipment tracking, returns and refunds, and saved delivery or billing addresses are not connected to orders yet, so none is shown here. Your agreed order amount and the activity above are all this page can confirm.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
