import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { RecentInquiry, Section } from "@/lib/buyer/dashboard";
import { formatDate } from "./format";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

/** Latest five inquiries of the signed-in buyer. Only the table fields: the message text is never sent to this widget. */
export function RecentInquiries({ section }: { section: Section<RecentInquiry[]> }) {
  return (
    <section className={styles.card} aria-labelledby="recent-inq-title">
      <div className={styles.cardHead}>
        <h2 id="recent-inq-title" className={styles.cardTitle}>
          Recent Inquiries
        </h2>
        <Link href="/buyer/inquiries" className={styles.viewAll}>
          View All <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      {section.status === "error" ? (
        <SectionError name="Recent inquiries" />
      ) : section.data.length === 0 ? (
        <div className={styles.emptyBlock}>
          <p className={styles.emptyNote}>No inquiries yet.</p>
          <Link href="/post-requirement" className={styles.linkButtonSmall}>
            <Plus size={16} aria-hidden /> Create New Inquiry
          </Link>
        </div>
      ) : (
        <div className={styles.tableScroll} role="region" aria-label="Recent inquiries table" tabIndex={0}>
          <table className={styles.table}>
            <caption className="visually-hidden">Your five most recent inquiries</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Product / Requirement</th>
                <th scope="col">Supplier</th>
                <th scope="col">Date</th>
                <th scope="col">Quantity</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {section.data.map((row) => (
                <tr key={row.id}>
                  <td data-label="Reference">{row.reference ?? "Not numbered"}</td>
                  <td data-label="Product / Requirement">{row.title}</td>
                  <td data-label="Supplier">{row.supplierName}</td>
                  <td data-label="Date">{formatDate(row.createdAt)}</td>
                  <td data-label="Quantity">
                    {row.quantity.toLocaleString("en-IN")}
                    {row.unit ? ` ${row.unit}` : ""}
                  </td>
                  <td data-label="Status">
                    <span className={`${styles.status} ${styles[`status${row.status}`] ?? ""}`}>{row.statusLabel}</span>
                  </td>
                  <td data-label="Action">
                    {row.href ? (
                      <Link href={row.href} className={styles.viewAll}>
                        View<span className="visually-hidden"> {row.reference}</span>
                      </Link>
                    ) : (
                      <Link href="/buyer/inquiries" className={styles.viewAll}>
                        View<span className="visually-hidden"> in My Inquiries</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
