import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TicketDto } from "@/lib/support/ticketService";
import inq from "../inquiries/Inquiries.module.css";
import { formatDateTime } from "../inquiries/format";
import { SupportTicketStatusBadge } from "./SupportTicketStatusBadge";
import styles from "./Support.module.css";

const Related = ({ t }: { t: TicketDto }) =>
  t.related ? (
    <span className={inq.refCell}>
      {t.related.href ? <Link href={t.related.href} className={inq.reference}>{t.related.reference.length > 24 ? t.related.label : t.related.reference}</Link> : t.related.label}
      <span className={inq.refType}>{t.related.typeLabel}</span>
    </span>
  ) : (
    <span className={inq.muted}>Not linked</span>
  );

const When = ({ iso }: { iso: string }) => <time dateTime={iso}>{formatDateTime(iso)}</time>;

/**
 * The buyer's tickets: a real table on wide screens and one card per ticket on narrow ones (same data and action; the one that does
 * not fit is hidden). The description and attachments are never part of a row. View Ticket opens the ticket's own page.
 */
export function BuyerSupportTicketTable({ rows }: { rows: TicketDto[] }) {
  return (
    <>
      <div className={inq.tableWrap}>
        <table className={`${inq.table} ${styles.ticketTable}`}>
          <caption>Your support tickets</caption>
          <thead>
            <tr>
              <th scope="col">Ticket ID</th>
              <th scope="col">Subject</th>
              <th scope="col">Category</th>
              <th scope="col">Related To</th>
              <th scope="col">Status</th>
              <th scope="col">Last Update</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.reference}>
                <td><Link href={t.detailHref} className={`${inq.reference} ${styles.refLink}`}>{t.reference}</Link></td>
                <td className={styles.subject}>{t.subject}</td>
                <td><span className={styles.catTag}>{t.category.label}</span></td>
                <td><Related t={t} /></td>
                <td><SupportTicketStatusBadge label={t.statusLabel} group={t.statusGroup} status={t.status} /></td>
                <td><When iso={t.updatedAt} /></td>
                <td><Link href={t.detailHref} className={`${inq.btn} ${styles.viewBtn}`} aria-label={`View ticket ${t.reference}`}>View <ArrowRight size={16} aria-hidden /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={inq.cards} aria-label="Your support tickets">
        {rows.map((t) => (
          <li key={t.reference} className={inq.card}>
            <div className={inq.cardTop}>
              <Link href={t.detailHref} className={inq.reference}>{t.reference}</Link>
              <SupportTicketStatusBadge label={t.statusLabel} group={t.statusGroup} status={t.status} />
            </div>
            <p className={styles.subject}>{t.subject}</p>
            <dl className={inq.facts}>
              <div><dt>Category</dt><dd><span className={styles.catTag}>{t.category.label}</span></dd></div>
              <div><dt>Related To</dt><dd><Related t={t} /></dd></div>
              <div><dt>Last Update</dt><dd><When iso={t.updatedAt} /></dd></div>
            </dl>
            <div className={inq.cardActions}>
              <Link href={t.detailHref} className={`${inq.btn} ${inq.btnPrimary}`}>View Ticket <ArrowRight size={16} aria-hidden /></Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
