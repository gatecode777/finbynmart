import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCount } from "@/lib/utils/format";
import type { ProductDetail } from "@/lib/catalog/productDetail";
import styles from "./ProductSupplierCard.module.css";

/**
 * "Supplied by" card with approved public facts only: name, initials as the logo (no genuine logos exist),
 * verification only where a record says so, supplier type where known, location and the real product count.
 * No rating, years in business or response rate: none of those exist as verified data.
 */
export function ProductSupplierCard({ supplier }: { supplier: ProductDetail["supplier"] }) {
  return (
    <aside className={styles.card} aria-label="Supplier">
      <p className={styles.eyebrow}>Supplied by</p>
      <div className={styles.head}>
        <span className={styles.logo} aria-hidden>
          {supplier.initials}
        </span>
        <div className={styles.identity}>
          {supplier.profileAvailable ? (
            <Link href={supplier.url} className={styles.name}>
              {supplier.name}
            </Link>
          ) : (
            <span className={styles.name}>{supplier.name}</span>
          )}
          {supplier.verificationStatus === "verified" && <Badge variant="success" icon>Verified Supplier</Badge>}
          {supplier.type && <span className={styles.type}>{supplier.type}</span>}
        </div>
      </div>

      <p className={styles.location}>
        <MapPin size={15} strokeWidth={2} aria-hidden />
        {supplier.city}, {supplier.state}
      </p>

      <p className={styles.stat}>
        <strong>{formatCount(supplier.productCount)}</strong> {supplier.productCount === 1 ? "product" : "products"} on Finbyn Mart
      </p>

      <div className={styles.links}>
        {supplier.profileAvailable && (
          <Link href={supplier.url} className={styles.link}>
            View Supplier Profile
            <ArrowRight size={16} aria-hidden />
          </Link>
        )}
        <Link href={supplier.productsUrl} className={styles.link}>
          All Products by Supplier ({formatCount(supplier.productCount)})
        </Link>
      </div>
    </aside>
  );
}
