"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Ban, MoreVertical, Package } from "lucide-react";
import type { OrderRow } from "@/lib/orders/service";
import inq from "../inquiries/Inquiries.module.css";
import { formatDateTime } from "../inquiries/format";
import { OrderStatusPill } from "./OrderStatusPill";
import styles from "./Orders.module.css";

interface Props {
  rows: OrderRow[];
  onCancel: (row: OrderRow) => void;
}

function Reference({ row }: { row: OrderRow }) {
  return (
    <span className={inq.refCell}>
      <Link href={row.detailHref} className={inq.reference}>{row.reference}</Link>
      <span className={inq.refType}><time dateTime={row.placedAt}>{formatDateTime(row.placedAt)}</time></span>
    </span>
  );
}

function ProductBlock({ row }: { row: OrderRow }) {
  const item = row.primaryItem;
  return (
    <span className={inq.productCell}>
      <span className={inq.thumb} aria-hidden>{item.imageSrc ? <Image src={item.imageSrc} alt="" width={56} height={56} unoptimized={item.imageRemote} /> : <Package size={24} />}</span>
      <span>
        <span className={inq.productName}>{item.url ? <Link href={item.url}>{item.name}</Link> : item.name}</span>
        {row.itemCount > 1 && <span className={styles.moreItems}>+{row.itemCount - 1} more {row.itemCount - 1 === 1 ? "item" : "items"}</span>}
      </span>
    </span>
  );
}

function SupplierBlock({ row }: { row: OrderRow }) {
  return (
    <span className={inq.supplierCell}>
      <span className={inq.initials} aria-hidden>{row.supplier.initials}</span>
      <span className={inq.supplierName}>{row.supplier.url ? <Link href={row.supplier.url}>{row.supplier.name}</Link> : row.supplier.name}</span>
    </span>
  );
}

const Amount = ({ row }: { row: OrderRow }) => <span className={styles.amount}>{row.amount.text}<span className={styles.small}>{row.amount.currency}, as agreed</span></span>;

const Expected = ({ row }: { row: OrderRow }) => (row.expectedDelivery ? <span className={styles.amount}><time dateTime={row.expectedDelivery.iso}>{row.expectedDelivery.label}</time><span className={styles.small}>{row.expectedDelivery.source}</span></span> : <span className={styles.small}>Not Available</span>);

/** Row actions: View Order is always visible; the menu holds the rest. Only what really works is offered (no tracking, invoice or return: no module). */
function RowActions({ row, onCancel }: { row: OrderRow; onCancel: (row: OrderRow) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      } else if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span className={inq.actions}>
      <Link href={row.detailHref} className={inq.btn} aria-label={`View order ${row.reference}`}>
        View Order <ArrowRight size={16} aria-hidden />
      </Link>
      {row.canRequestCancellation && (
        <span className={inq.rowMenu} ref={wrap}>
          <button ref={button} type="button" className={inq.rowMenuButton} aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${row.reference}`} onClick={() => setOpen((v) => !v)}>
            <MoreVertical size={18} aria-hidden />
          </button>
          {open && (
            <div className={inq.menu} role="menu">
              <button type="button" className={`${inq.menuItem} ${inq.menuItemDanger}`} role="menuitem" onClick={() => { setOpen(false); onCancel(row); }}>
                <Ban size={16} aria-hidden /> Request Cancellation
              </button>
            </div>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * The order list: a real table on wide screens and one card per order on narrow ones (same data and actions; the one that does not
 * fit is hidden). Amounts are the saved order totals in their own currency; the delivery column is the delivery meaning of the order
 * status; the expected date is shown only when the order holds one, with where it came from.
 */
export function BuyerOrderTable({ rows, onCancel }: Props) {
  return (
    <>
      <div className={inq.tableWrap}>
        <table className={inq.table}>
          <caption>Your orders</caption>
          <thead>
            <tr>
              <th scope="col">Order Reference &amp; Date</th>
              <th scope="col">Product(s)</th>
              <th scope="col">Supplier</th>
              <th scope="col">Quantity</th>
              <th scope="col">Order Amount</th>
              <th scope="col">Order Status</th>
              <th scope="col">Delivery</th>
              <th scope="col">Expected Delivery</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reference} id={`ref-${row.reference}`}>
                <td><Reference row={row} /></td>
                <td><ProductBlock row={row} /></td>
                <td><SupplierBlock row={row} /></td>
                <td className={inq.nowrap}>{row.primaryItem.quantityText}{row.itemCount > 1 && <span className={styles.moreItems}>first item</span>}</td>
                <td><Amount row={row} /></td>
                <td><OrderStatusPill status={row.status} group={row.statusGroup} label={row.statusLabel} /></td>
                <td>{row.deliveryLabel}</td>
                <td><Expected row={row} /></td>
                <td><RowActions row={row} onCancel={onCancel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={inq.cards} aria-label="Your orders">
        {rows.map((row) => (
          <li key={row.reference} id={`card-${row.reference}`} className={inq.card}>
            <div className={inq.cardTop}>
              <Reference row={row} />
              <OrderStatusPill status={row.status} group={row.statusGroup} label={row.statusLabel} />
            </div>
            <ProductBlock row={row} />
            <dl className={inq.facts}>
              <div><dt>Order Amount</dt><dd><Amount row={row} /></dd></div>
              <div><dt>Supplier</dt><dd><SupplierBlock row={row} /></dd></div>
              <div><dt>Quantity</dt><dd>{row.primaryItem.quantityText}{row.itemCount > 1 && <span className={styles.moreItems}>first item</span>}</dd></div>
              <div><dt>Delivery</dt><dd>{row.deliveryLabel}</dd></div>
              <div><dt>Expected Delivery</dt><dd><Expected row={row} /></dd></div>
            </dl>
            <div className={inq.cardActions}>
              <Link href={row.detailHref} className={`${inq.btn} ${inq.btnPrimary}`}>
                View Order <ArrowRight size={16} aria-hidden />
              </Link>
              {row.canRequestCancellation && (
                <button type="button" className={inq.btn} onClick={() => onCancel(row)}>
                  <Ban size={16} aria-hidden /> Request Cancellation
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
