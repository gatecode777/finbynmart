import Link from "next/link";
import { FileText } from "lucide-react";
import type { Section, Unavailable } from "@/lib/buyer/dashboard";
import styles from "./Dashboard.module.css";

/** There is no quotation module yet, so this says so. No quotation, amount or validity is ever invented. */
export function RecentQuotations({ section }: { section: Section<Unavailable> }) {
  const reason = section.status === "ok" ? section.data.reason : "Supplier quotations are not connected yet.";
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
        <Link href="/products" className={styles.linkButtonSmall}>
          Browse Products
        </Link>
      </div>
    </section>
  );
}
