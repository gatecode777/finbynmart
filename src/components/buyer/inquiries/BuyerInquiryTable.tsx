"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Ban, FileText, MoreVertical, Package, Route } from "lucide-react";
import type { BuyerInquiryRow } from "@/lib/inquiries/buyerList";
import { StatusPill } from "./StatusPill";
import { formatDateTime, formatQuantity } from "./format";
import styles from "./Inquiries.module.css";

interface Props {
  rows: BuyerInquiryRow[];
  onCancel: (row: BuyerInquiryRow) => void;
}

const title = (row: BuyerInquiryRow) => row.product?.name ?? row.inquiryTypeLabel;

function Thumb({ row }: { row: BuyerInquiryRow }) {
  const Icon = row.product ? Package : FileText;
  return (
    <span className={styles.thumb} aria-hidden>
      {row.product?.imageSrc ? <Image src={row.product.imageSrc} alt="" width={56} height={56} unoptimized={row.product.imageRemote} /> : <Icon size={24} />}
    </span>
  );
}

function Reference({ row }: { row: BuyerInquiryRow }) {
  return (
    <span className={styles.refCell}>
      {row.reference ? (
        <Link href={row.detailHref} className={styles.reference}>{row.reference}</Link>
      ) : (
        <Link href={row.detailHref} className={styles.reference}>Earlier inquiry</Link>
      )}
      <span className={styles.refType}>{row.inquiryTypeLabel}</span>
    </span>
  );
}

function ProductBlock({ row }: { row: BuyerInquiryRow }) {
  return (
    <span className={styles.productCell}>
      <Thumb row={row} />
      <span>
        <span className={styles.productName}>{row.product?.url ? <Link href={row.product.url}>{title(row)}</Link> : title(row)}</span>
        {row.categoryName && <span className={styles.muted}> <br />{row.categoryName}</span>}
        {row.product && !row.product.url && <span className={styles.muted}> <br />No longer listed</span>}
      </span>
    </span>
  );
}

function SupplierBlock({ row }: { row: BuyerInquiryRow }) {
  return (
    <span className={styles.supplierCell}>
      <span className={styles.initials} aria-hidden>{row.supplier.initials}</span>
      <span className={styles.supplierName}>{row.supplier.url ? <Link href={row.supplier.url}>{row.supplier.name}</Link> : row.supplier.name}</span>
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatDateTime(iso)}</time>;
}

/** Row actions: View Details is always visible; the menu holds the rest. No quotation exists for any inquiry, so there is no "View Quotation". */
function RowActions({ row, onCancel }: { row: BuyerInquiryRow; onCancel: (row: BuyerInquiryRow) => void }) {
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
    <span className={styles.actions}>
      <Link href={row.detailHref} className={styles.btn} aria-label={`View details of ${row.reference ?? "this inquiry"}`}>
        View Details <ArrowRight size={16} aria-hidden />
      </Link>
      <span className={styles.rowMenu} ref={wrap}>
        <button ref={button} type="button" className={styles.rowMenuButton} aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${row.reference ?? "this inquiry"}`} onClick={() => setOpen((v) => !v)}>
          <MoreVertical size={18} aria-hidden />
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            <Link href={`${row.detailHref}#progress`} className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              <Route size={16} aria-hidden /> Track Inquiry
            </Link>
            {row.canCancel && (
              <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem" onClick={() => { setOpen(false); onCancel(row); }}>
                <Ban size={16} aria-hidden /> Cancel Inquiry
              </button>
            )}
          </div>
        )}
      </span>
    </span>
  );
}

/**
 * The inquiry list: a real table on wide screens and one card per inquiry on narrow ones (both carry the same data and actions; the
 * one that does not fit is hidden, so a screen reader reads only one). The private message of an inquiry is never part of a row.
 */
export function BuyerInquiryTable({ rows, onCancel }: Props) {
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Your inquiries</caption>
          <thead>
            <tr>
              <th scope="col">Inquiry Reference</th>
              <th scope="col">Product / Requirement</th>
              <th scope="col">Supplier</th>
              <th scope="col">Quantity</th>
              <th scope="col">Submitted On</th>
              <th scope="col">Last Updated</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} id={row.reference ? `ref-${row.reference}` : undefined}>
                <td><Reference row={row} /></td>
                <td><ProductBlock row={row} /></td>
                <td><SupplierBlock row={row} /></td>
                <td className={styles.nowrap}>{formatQuantity(row.quantity, row.unit)}</td>
                <td><When iso={row.submittedAt} /></td>
                <td><When iso={row.updatedAt} /></td>
                <td><StatusPill status={row.status} label={row.statusLabel} /></td>
                <td><RowActions row={row} onCancel={onCancel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.cards} aria-label="Your inquiries">
        {rows.map((row) => (
          <li key={row.id} id={row.reference ? `card-${row.reference}` : undefined} className={styles.card}>
            <div className={styles.cardTop}>
              <Reference row={row} />
              <StatusPill status={row.status} label={row.statusLabel} />
            </div>
            <ProductBlock row={row} />
            <dl className={styles.facts}>
              <div><dt>Supplier</dt><dd><SupplierBlock row={row} /></dd></div>
              <div><dt>Quantity</dt><dd>{formatQuantity(row.quantity, row.unit)}</dd></div>
              <div><dt>Submitted On</dt><dd><When iso={row.submittedAt} /></dd></div>
              <div><dt>Last Updated</dt><dd><When iso={row.updatedAt} /></dd></div>
            </dl>
            <div className={styles.cardActions}>
              <Link href={row.detailHref} className={`${styles.btn} ${styles.btnPrimary}`}>
                View Details <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href={`${row.detailHref}#progress`} className={styles.btn}>
                <Route size={16} aria-hidden /> Track
              </Link>
              {row.canCancel && (
                <button type="button" className={styles.btn} onClick={() => onCancel(row)}>
                  <Ban size={16} aria-hidden /> Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
