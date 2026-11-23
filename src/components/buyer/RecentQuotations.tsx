import Link from "next/link";
import { FileText } from "lucide-react";
import type { Section, Unavailable } from "@/lib/buyer/dashboard";
import styles from "./Dashboard.module.css";

/** The dashboard does not read quotations yet, so this says so and points to the Quotations page. No quotation, amount or validity is ever invented. */
export function RecentQuotations({ section }: { section: Section<Unavailable> }) {
  const reason = section.status === "ok" ? section.data.reason : "Quotation figures are not shown on this dashboard yet. Open Quotations in the sidebar for the ones you have received.";
  return (
    <section className={styles.card} aria-labelledby="recent-quo-title">
      <div className={styles.cardHead}>
        <h2 id="recent-quo-title" className={styles.cardTitle}>
          Recent Quotations
        </h2>
      </div>
      <div className={styles.emptyBlock}>
        <span className={styles.unavailableIcon}>
          <FileText size={26} aria-hidden />
        </span>
        <p className={styles.emptyNote}>Quotations will appear here once supplier quotations are connected.</p>
        <p className={styles.legendNote}>{reason}</p>
        <Link prefetch={false} href="/products" className={styles.linkButtonSmall}>
          Browse Products
        </Link>
      </div>
    </section>
  );
}
