import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Recommendations, Section } from "@/lib/buyer/dashboard";
import { initialsOf } from "./format";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

/** Public catalogue suppliers only. No verified badge, rating, review count or response time: the data has none of them. */
export function RecommendedSuppliers({ section }: { section: Section<Recommendations> }) {
  return (
    <section className={styles.card} aria-labelledby="rec-title">
      <h2 id="rec-title" className={styles.cardTitle}>
        {section.status === "ok" && !section.data.personalized ? "Featured Suppliers" : "Recommended Suppliers"}
      </h2>
      {section.status === "error" ? (
        <SectionError name="Suppliers" />
      ) : (
        <>
          <p className={styles.legendNote}>{section.data.basis}</p>
          {section.data.suppliers.length === 0 ? (
            <p className={styles.emptyNote}>No suppliers to show yet.</p>
          ) : (
            <ul className={styles.supplierList}>
              {section.data.suppliers.map((supplier) => (
                <li key={supplier.slug} className={styles.supplierRow}>
                  <span className={styles.supplierAvatar} aria-hidden>
                    {initialsOf(supplier.name)}
                  </span>
                  <span className={styles.supplierText}>
                    <strong>{supplier.name}</strong>
                    <span>
                      {supplier.city}, {supplier.state}
                    </span>
                  </span>
                  <Link href={supplier.url} className={styles.linkButtonSmall}>
                    View<span className="visually-hidden"> {supplier.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/suppliers" className={styles.outlineButton}>
            Find More Suppliers <ArrowRight size={16} aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
