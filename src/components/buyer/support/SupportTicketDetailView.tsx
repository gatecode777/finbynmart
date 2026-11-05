import Link from "next/link";
import { ArrowLeft, Download, ListChecks, Paperclip } from "lucide-react";
import type { TicketDetail } from "@/lib/support/ticketService";
import d from "../inquiries/detail/InquiryDetail.module.css";
import { SupportTicketStatusBadge } from "./SupportTicketStatusBadge";
import styles from "./Support.module.css";

const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * One ticket, from what the database holds: reference, category, what it is about, the description exactly as written (as text),
 * private attachments with an owner-checked download, and the recorded history. This is the compact page the list links to; the
 * conversation with support (replies, reopen, close) is Page 37 and does not exist yet, so none of it is offered or implied.
 */
export function SupportTicketDetailView({ data: t }: { data: TicketDetail }) {
  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href="/buyer/support" className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to Help &amp; Support</Link>
      </div>
      <div className={d.grid}>
        <div className={d.main}>
          <section className={d.card} aria-labelledby="ticket-summary-title">
            <div className={d.overview}>
              <div className={d.overviewText}>
                <p className={d.refBadge}>Ticket Reference</p>
                <h2 id="ticket-summary-title" className={`${d.reference} ${styles.wrap}`}>{t.reference}</h2>
                <p className={d.productName}>{t.subject}</p>
                <p className={d.muted}><span className={styles.catTag}>{t.category.label}</span></p>
                {t.related && <p className={d.muted}>About {t.related.typeLabel.toLowerCase()}: {t.related.href ? <Link href={t.related.href} className={d.link}>{t.related.label}</Link> : t.related.label}</p>}
              </div>
              <dl className={d.dates}>
                <div><dt>Raised On</dt><dd><time dateTime={t.createdAt}>{t.createdLabel}</time></dd></div>
                <div><dt>Last Update</dt><dd><time dateTime={t.updatedAt}>{t.updatedLabel}</time></dd></div>
              </dl>
              <div className={d.statusBox}>
                <p className={d.muted}>Status</p>
                <SupportTicketStatusBadge label={t.statusLabel} group={t.statusGroup} status={t.status} />
              </div>
            </div>
          </section>

          <section className={d.card} aria-labelledby="ticket-description-title">
            <h2 id="ticket-description-title" className={d.cardTitle}>Description</h2>
            <p className={styles.pre}>{t.description}</p>
          </section>

          <section className={d.card} aria-labelledby="ticket-attachments-title">
            <h2 id="ticket-attachments-title" className={d.cardTitle}><Paperclip size={20} aria-hidden /> Attachments ({t.attachments.length})</h2>
            {t.attachments.length === 0 ? (
              <p className={d.muted}>No files were attached.</p>
            ) : (
              <ul className={styles.attachmentList}>
                {t.attachments.map((a) => (
                  <li key={a.id}>
                    <span>{a.name} <span className={d.muted}>({size(a.size)})</span></span>
                    <a href={a.href} className={d.btn} download><Download size={16} aria-hidden /> Download</a>
                  </li>
                ))}
              </ul>
            )}
            <p className={d.muted}>Files are kept privately and can only be downloaded by you.</p>
          </section>

          <section className={d.card} aria-labelledby="ticket-history-title">
            <h2 id="ticket-history-title" className={d.cardTitle}><ListChecks size={20} aria-hidden /> History</h2>
            <ul className={styles.attachmentList}>
              {t.events.map((e, n) => (
                <li key={n}><strong>{e.label}</strong><span className={d.muted}>{e.atLabel} · {e.actor}</span></li>
              ))}
            </ul>
          </section>
        </div>
        <aside className={d.side}>
          <section className={d.card} aria-labelledby="ticket-note-title">
            <h2 id="ticket-note-title" className={d.cardTitle}>What happens next</h2>
            <p className={d.muted}>Your ticket is saved and stays {t.statusLabel.toLowerCase()} until Finbyn Mart&apos;s support team changes it. There is no support team replying through this site yet, so there are no replies here. Replies, reopening and closing will come with the full ticket page.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
