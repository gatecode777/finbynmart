import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import clsx from "clsx";
import { MediaTile } from "@/components/ui/MediaTile";
import { Badge } from "@/components/ui/Badge";
import { formatPriceRange, formatCount } from "@/lib/utils/format";
import type { ProductCardData, ViewMode } from "@/types";
import styles from "./ProductCard.module.css";

export function ProductCard({ product, view }: { product: ProductCardData; view: ViewMode }) {
  return (
    <article className={clsx(styles.card, view === "list" && styles.listCard)}>
      <div className={styles.tileWrap}>
        <MediaTile tile={product.tile} alt={product.name} iconSize={30} />
        {product.badge && (
          <span className={styles.badgeOverlay}>
            <Badge variant="neutral">{product.badge}</Badge>
          </span>
        )}
      </div>

      <div className={styles.body}>
        <Link href={product.href} className={styles.name}>
          {product.name}
        </Link>

        <span className={styles.price}>
          {product.priceIsEstimated && <span className={styles.estimate}>Est. </span>}
          {formatPriceRange(product.priceMin, product.priceMax)}
          <span className={styles.priceUnit}>/{product.priceUnit}</span>
        </span>

        {product.moq !== undefined && product.moqUnit && (
          <span className={styles.moq}>
            MOQ: {formatCount(product.moq)} {product.moqUnit}
          </span>
        )}

        <div className={styles.supplierRow}>
          <Link href={product.supplierHref} className={styles.supplierName}>
            {product.supplierName}
          </Link>
          {product.verified && <Badge variant="success" icon>Verified</Badge>}
        </div>

        <span className={styles.location}>
          <MapPin size={12} strokeWidth={2} aria-hidden />
          {product.supplierCity}, {product.supplierState}
        </span>

        {product.rating && (
          <span className={styles.rating}>
            <Star size={13} className={styles.star} fill="currentColor" strokeWidth={0} aria-hidden />
            {product.rating.toFixed(1)}
            {product.reviewCount && ` (${formatCount(product.reviewCount)})`}
          </span>
        )}

        <Link href={product.href} className={styles.cta}>
          Get Best Quote
        </Link>
      </div>
    </article>
  );
}
