import Image from "next/image";
import Link from "next/link";
import { FileText, History, MapPin, Package, Paperclip, ListChecks } from "lucide-react";
import { InquiryTimeline } from "@/components/inquiry/InquiryTimeline";
import type { InquiryDetailDto } from "@/lib/inquiries/buyerDetail";
import { StatusPill } from "../StatusPill";
import { formatQuantity } from "../format";
import { BottomBar, HeaderActions } from "./InquiryActions";
import { InquiryTabs } from "./InquiryTabs";
import styles from "./InquiryDetail.module.css";

const PREVIEW = 280;

function nextSteps(d: InquiryDetailDto): { text: string; href?: string; linkText?: string }[] {
  switch (d.status) {
    case "NEW":
    case "NOTIFIED":
    case "IN_PROGRESS":
      return [
        { text: "Wait for the supplier. Response timing depends on the supplier." },
        { text: "Not the right supplier? Look at other suppliers.", href: "/suppliers", linkText: "Browse suppliers" },
        ...(d.canCancel ? [{ text: "No longer needed? You can cancel this inquiry with Cancel Inquiry." }] : []),
      ];
    case "REPLIED":
      return [{ text: "The supplier has replied. Supplier replies are not shown on this page yet." }];
    case "QUOTED":
      return [{ text: "A quotation is linked to this inquiry. Open it from the Quotations tab or My Quotations.", href: "/buyer/quotations", linkText: "My Quotations" }];
    default:
      return [{ text: `This inquiry is ${d.businessLabel.toLowerCase()}; nothing more can be done with it.` }, { text: "Need something similar?", href: "/products", linkText: "Send a new inquiry" }];
  }
}

/** The buyer's inquiry in full: only what the database holds. Everything that needs a module that does not exist yet says so. */
export function InquiryDetailView({ data: d }: { data: InquiryDetailDto }) {
  const cancel = d.canCancel ? { key: d.key, reference: d.reference || null, supplierName: d.supplier.name } : null;
  const title = d.product?.name ?? d.inquiryTypeLabel;
  const message = d.message ?? "";
  const long = message.length > PREVIEW;

  return (
    <>
      <div className={styles.headerRow}>
        <HeaderActions cancel={cancel} />
      </div>

      <div className={styles.grid}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="overview-title">
            <div className={styles.overview}>
              <span className={styles.thumb} aria-hidden>
                {d.product?.imageSrc ? <Image src={d.product.imageSrc} alt="" width={120} height={120} unoptimized={d.product.imageRemote} /> : d.product ? <Package size={40} /> : <FileText size={40} />}
              </span>
              <div className={styles.overviewText}>
                <p className={styles.refBadge}>Inquiry Reference</p>
                <h2 id="overview-title" className={styles.reference}>{d.reference || "Earlier inquiry"}</h2>
                <p className={styles.productName}>{title}</p>
                {(d.product || d.categoryName) && <p className={styles.muted}>{d.product ? d.inquiryTypeLabel : ""}{d.product && d.categoryName ? " · " : ""}{d.categoryName ?? ""}</p>}
                {d.product && !d.product.available && <p className={styles.muted}>This product is no longer listed; the saved name is shown.</p>}
              </div>
              <dl className={styles.dates}>
                <div><dt>Submitted On</dt><dd><time dateTime={d.submittedAt}>{d.submittedLabel}</time></dd></div>
                <div><dt>Last Updated</dt><dd><time dateTime={d.updatedAt}>{d.updatedLabel}</time></dd></div>
              </dl>
              <div className={styles.statusBox}>
                <p className={styles.muted}>Current Status</p>
                <StatusPill status={d.status} label={d.businessLabel} />
                <p className={styles.muted}>{d.statusText}</p>
              </div>
            </div>
          </section>

          <section id="progress" className={styles.card} aria-labelledby="progress-title">
            <h2 id="progress-title" className={styles.cardTitle}><ListChecks size={20} aria-hidden /> Inquiry Progress</h2>
            <InquiryTimeline steps={d.timeline} />
            <p className={styles.muted}>{d.notification.label}</p>
          </section>

          <section className={styles.card} aria-labelledby="requirement-title">
            <h2 id="requirement-title" className={styles.cardTitle}><FileText size={20} aria-hidden /> Requirement Details</h2>
            <dl className={styles.rows}>
              <div><dt>Product / Category</dt><dd>{d.product ? d.product.name : "No product (not tied to one product)"}{d.categoryName ? ` · ${d.categoryName}` : ""}</dd></div>
              <div><dt>Inquiry Type</dt><dd>{d.inquiryTypeLabel}</dd></div>
              <div><dt>Requested Quantity</dt><dd>{formatQuantity(d.quantity, d.unit)}</dd></div>
              <div><dt>Preferred Delivery Location</dt><dd>{d.deliveryLocation ?? "Not Specified"}</dd></div>
              <div>
                <dt>Description</dt>
                <dd>
                  {message ? (
                    long ? (
                      <>
                        <span className={styles.text}>{message.slice(0, PREVIEW).trimEnd()}...</span>
                        <details className={styles.more}>
                          <summary>Show the full message</summary>
                          <p className={styles.text}>{message}</p>
                        </details>
                      </>
                    ) : (
                      <span className={styles.text}>{message}</span>
                    )
                  ) : (
                    "Not Specified"
                  )}
                </dd>
              </div>
            </dl>
            <p className={styles.muted}>Target price and a required-by date are not collected by the inquiry form, so they are not shown.</p>
          </section>

          <section className={styles.card} aria-labelledby="attachments-title">
            <h2 id="attachments-title" className={styles.cardTitle}><Paperclip size={20} aria-hidden /> Attachments</h2>
            <p className={styles.muted}>No attachments. Files cannot be added to an inquiry yet.</p>
          </section>

          <InquiryTabs quotations={d.quotations} />

          <section className={styles.card} aria-labelledby="history-title">
            <h2 id="history-title" className={styles.cardTitle}><History size={20} aria-hidden /> Inquiry History</h2>
            {d.history.length === 0 ? (
              <p className={styles.muted}>This inquiry was saved before status history was kept, so only its submission time is known.</p>
            ) : (
              <ol className={styles.history}>
                {d.history.map((h, i) => (
                  <li key={i}>
                    <strong>{h.from ? `${h.from === h.to ? h.toLabel : h.toLabel}` : "Submitted"}</strong>
                    {h.reason ? ` - ${h.reason}` : ""}
                    <span className={styles.muted}> {h.actor === "buyer" ? "by you" : h.actor === "system" ? "by the system" : ""} </span>
                    <time dateTime={h.at} className={styles.muted}>{h.atLabel}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className={styles.side} aria-label="Inquiry summary">
          <section className={styles.card} aria-labelledby="summary-title">
            <h2 id="summary-title" className={styles.cardTitle}>Inquiry Summary</h2>
            <dl className={styles.rows}>
              <div><dt>Inquiry Reference</dt><dd>{d.reference || "Earlier inquiry"}</dd></div>
              <div><dt>Inquiry Type</dt><dd>{d.inquiryTypeLabel}</dd></div>
              <div><dt>Status</dt><dd><StatusPill status={d.status} label={d.businessLabel} /></dd></div>
              <div><dt>Responses Received</dt><dd>Not available yet</dd></div>
              <div><dt>Quotations Received</dt><dd>{d.quotations === null ? "Could not be loaded" : d.quotations.length}</dd></div>
              <div><dt>Submitted</dt><dd>{d.submittedLabel}</dd></div>
              <div><dt>Last Updated</dt><dd>{d.updatedLabel}</dd></div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="supplier-title">
            <h2 id="supplier-title" className={styles.cardTitle}>Supplier</h2>
            <div className={styles.supplier}>
              <span className={styles.initials} aria-hidden>{d.supplier.initials}</span>
              <div>
                <p className={styles.productName}>{d.supplier.url ? <Link href={d.supplier.url}>{d.supplier.name}</Link> : d.supplier.name}</p>
                {d.supplier.location && <p className={styles.metaLine}><MapPin size={14} aria-hidden /> {d.supplier.location}</p>}
                {d.supplier.kind && <p className={styles.muted}>{d.supplier.kind}</p>}
                {!d.supplier.available && <p className={styles.muted}>This supplier no longer has a public page; the saved name is shown.</p>}
              </div>
            </div>
            <p className={styles.muted}>This inquiry was sent to this one supplier.</p>
          </section>

          <section className={styles.card} aria-labelledby="next-title">
            <h2 id="next-title" className={styles.cardTitle}>Next Steps</h2>
            <ul className={styles.steps}>
              {nextSteps(d).map((s) => (
                <li key={s.text}>
                  {s.text} {s.href && <Link href={s.href} className={styles.link}>{s.linkText}</Link>}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <BottomBar cancel={cancel} />
    </>
  );
}
