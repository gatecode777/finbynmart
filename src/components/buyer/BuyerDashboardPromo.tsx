import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import styles from "./Dashboard.module.css";

/**
 * The reference says "from Verified Suppliers"; no supplier is verified (there is no verification process), so the wording
 * here does not say it. No statistics are shown.
 */
export function BuyerDashboardPromo() {
  return (
    <section className={styles.promo} aria-labelledby="promo-title">
      <div>
        <h2 id="promo-title" className={styles.promoTitle}>
          Get Better Quotes from Suppliers
        </h2>
        <p>Explore products and connect with suppliers for your business requirements.</p>
        <Link href="/products" className={styles.promoButton}>
          Explore Now <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      <Package size={72} aria-hidden className={styles.promoArt} />
    </section>
  );
}
