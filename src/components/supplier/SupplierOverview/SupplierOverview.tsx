import { BookOpen } from "lucide-react";
import type { SupplierProfile } from "@/types";
import styles from "./SupplierOverview.module.css";

export function SupplierOverview({ supplier }: { supplier: SupplierProfile }) {
  return (
    <section id="overview" className={styles.section} aria-labelledby="overview-heading">
      <h2 id="overview-heading" className={styles.heading}>
        <BookOpen size={18} strokeWidth={2} aria-hidden />
        About {supplier.name}
      </h2>
      <p className={styles.description}>{supplier.description}</p>
    </section>
  );
}
