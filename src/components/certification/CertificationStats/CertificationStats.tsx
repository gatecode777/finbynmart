import { Award, CheckCircle2, Clock, XCircle } from "lucide-react";
import clsx from "clsx";
import type { CertificationStats as Stats } from "@/lib/certifications/engine";
import { EXPIRING_SOON_DAYS } from "@/lib/certifications/expiry";
import { formatCount } from "@/lib/utils/format";
import styles from "./CertificationStats.module.css";

/** The four counts above the list. All of them come from the supplier's own approved records. */
export function CertificationStats({ stats }: { stats: Stats }) {
  const items = [
    { key: "total", icon: Award, tone: styles.total, value: stats.total, label: "Total Certifications" },
    { key: "verified", icon: CheckCircle2, tone: styles.verified, value: stats.verified, label: "Verified" },
    { key: "soon", icon: Clock, tone: styles.soon, value: stats.expiringSoon, label: "Expiring Soon", note: `(Within ${EXPIRING_SOON_DAYS} Days)` },
    { key: "expired", icon: XCircle, tone: styles.expired, value: stats.expired, label: "Expired" },
  ];

  return (
    <section className={styles.stats} aria-label="Certification overview">
      <ul className={styles.list}>
        {items.map(({ key, icon: Icon, tone, value, label, note }) => (
          <li key={key} className={styles.item}>
            <span className={clsx(styles.icon, tone)} aria-hidden>
              <Icon size={30} strokeWidth={1.6} />
            </span>
            <p className={styles.text}>
              <span className={styles.value}>{formatCount(value)}</span>
              <span className={styles.label}>{label}</span>
              {note && <span className={styles.note}>{note}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
