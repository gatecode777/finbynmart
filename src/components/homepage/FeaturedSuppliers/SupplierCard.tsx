import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { MediaTile } from "@/components/ui/MediaTile";
import { Badge } from "@/components/ui/Badge";
import type { Supplier } from "@/types";
import styles from "./SupplierCard.module.css";

export function SupplierCard({ supplier }: { supplier: Supplier }) {
  return (
    <article className={styles.card}>
      <div className={styles.tileWrap}>
        <MediaTile tile={supplier.tile} alt={supplier.name} />
      </div>
      <div className={styles.body}>
        <div className={styles.nameRow}>
          <Link href={supplier.href} className={styles.name}>
            {supplier.name}
          </Link>
          {supplier.verified && <Badge variant="success" icon>Verified</Badge>}
        </div>

        <span className={styles.location}>
          <MapPin size={12} strokeWidth={2} aria-hidden />
          {supplier.city}, {supplier.state}
        </span>

        <span className={styles.category}>{supplier.categoryLabel}</span>

        {supplier.rating && (
          <span className={styles.rating}>
            <Star size={13} className={styles.star} fill="currentColor" strokeWidth={0} aria-hidden />
            {supplier.rating.toFixed(1)}
            {supplier.reviewCount && ` (${supplier.reviewCount})`}
          </span>
        )}

        <Link href={supplier.href} className={`${styles.cta} ${styles.ctaButton}`}>
          View Products
        </Link>
      </div>
    </article>
  );
}
