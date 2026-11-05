import Link from "next/link";
import { ChevronRight, FileText, MessageSquareText, Package } from "lucide-react";
import type { Activity, Section } from "@/lib/buyer/dashboard";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

export function BuyerActivityProgress({ section }: { section: Section<Activity> }) {
  return (
    <section className={styles.card} aria-labelledby="act-title">
      <h2 id="act-title" className={styles.cardTitle}>
        Your Activity Progress
      </h2>
      {section.status === "error" ? (
        <SectionError name="Activity" />
      ) : (
        <ul className={styles.activityList}>
          <li>
            <Link href="/buyer/inquiries" className={styles.activityRow}>
              <MessageSquareText size={18} aria-hidden />
              <span className={styles.activityName}>Active Inquiries</span>
              <strong>{section.data.activeInquiries}</strong>
              <ChevronRight size={16} aria-hidden />
            </Link>
          </li>
          <li className={`${styles.activityRow} ${styles.activityDisabled}`}>
            <FileText size={18} aria-hidden />
            <span className={styles.activityName}>Pending Quotations</span>
            <span className={styles.badgeMuted}>Not available yet</span>
          </li>
          <li className={`${styles.activityRow} ${styles.activityDisabled}`}>
            <Package size={18} aria-hidden />
            <span className={styles.activityName}>Open Orders</span>
            <span className={styles.badgeMuted}>Not available yet</span>
          </li>
        </ul>
      )}
    </section>
  );
}
