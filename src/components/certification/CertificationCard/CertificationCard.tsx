import { Award, BadgeCheck, Building2, CalendarDays, CheckCircle2, Clock, Download, FileDown, HardHat, Leaf, ShieldCheck, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { formatDate } from "@/lib/certifications/expiry";
import type { PublicCertification } from "@/lib/certifications/types";
import styles from "./CertificationCard.module.css";

/** One icon per display category. These are generic icons: no issuing authority's logo is ever drawn. */
const ICONS: Record<string, LucideIcon> = {
  "quality-management": Award,
  environmental: Leaf,
  "product-compliance": ShieldCheck,
  safety: HardHat,
  "business-registration": Building2,
  "industry-specific": BadgeCheck,
};

/**
 * One public certification: name, category, status, issuing authority, dates, the certificate number only when it was
 * approved for display, and the document actions only when the file really can be opened. An expired certificate says
 * so (with its date) and is never presented as currently valid.
 */
export function CertificationCard({ certification: c }: { certification: PublicCertification }) {
  const Icon = ICONS[c.type.value] ?? BadgeCheck;
  const expired = c.status === "expired";
  const soon = c.expiry.state === "expiring" && c.expiry.daysLeft !== null;
  const doc = c.document;
  const headingId = `cert-${c.id}`;

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <span className={styles.logo} aria-hidden>
          <Icon size={34} strokeWidth={1.6} />
        </span>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <h3 id={headingId} className={styles.name}>
              {c.name}
            </h3>
            <span className={clsx(styles.status, expired ? styles.expired : styles.verified)}>
              {expired ? <XCircle size={14} strokeWidth={2.25} aria-hidden /> : <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden />}
              {expired ? "Expired" : "Verified"}
            </span>
          </div>
          <p className={styles.type}>{c.type.label}</p>
          <p className={styles.authority}>
            <span className={styles.muted}>Issued by</span> {c.authority}
          </p>
        </div>
      </div>

      {c.description && <p className={styles.description}>{c.description}</p>}

      <dl className={styles.dates}>
        <div className={styles.date}>
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
          <dt>Issued:</dt>
          <dd>
            <time dateTime={c.issueDate}>{formatDate(c.issueDate)}</time>
          </dd>
        </div>
        <div className={styles.date}>
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
          <dt>{expired ? "Expired On:" : "Valid Till:"}</dt>
          <dd>{c.expiryDate ? <time dateTime={c.expiryDate}>{formatDate(c.expiryDate)}</time> : "No expiry date"}</dd>
        </div>
      </dl>

      {soon && (
        <p className={styles.soon}>
          <Clock size={14} strokeWidth={2.25} aria-hidden />
          {c.expiry.daysLeft === 0 ? "Expires today" : `Expires in ${c.expiry.daysLeft} ${c.expiry.daysLeft === 1 ? "day" : "days"}`}
        </p>
      )}

      <div className={styles.foot}>
        {c.certificateNumber && (
          <p className={styles.number}>
            <span className={styles.muted}>Certificate No.:</span> <span className={styles.numberValue}>{c.certificateNumber}</span>
          </p>
        )}
        {doc.available && doc.href ? (
          <div className={styles.actions}>
            <a href={doc.href} target="_blank" rel="noopener noreferrer" className={styles.view}>
              <FileDown size={16} strokeWidth={2} aria-hidden />
              {doc.kind === "pdf" ? "View Certificate (PDF)" : "View Certificate"}
              <span className="visually-hidden"> for {c.name} (opens in a new tab)</span>
            </a>
            <a href={`${doc.href}?download=1`} download className={styles.download} aria-label={`Download ${c.name} certificate`}>
              <Download size={16} strokeWidth={2} aria-hidden />
            </a>
          </div>
        ) : (
          <p className={styles.noDoc}>The certificate file is not shared online.</p>
        )}
      </div>
    </article>
  );
}
