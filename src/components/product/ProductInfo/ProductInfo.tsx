import Link from "next/link";
import { MapPin, Star, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatPriceRange, formatCount } from "@/lib/utils/format";
import type { ProductDetailData } from "@/types";
import styles from "./ProductInfo.module.css";

export function ProductInfo({ product }: { product: ProductDetailData }) {
  return (
    <div className={styles.info}>
      {product.badge && <Badge variant="neutral">{product.badge}</Badge>}

      <h1 className={styles.name}>{product.name}</h1>

      {product.rating && (
        <span className={styles.rating}>
          <Star size={14} className={styles.star} fill="currentColor" strokeWidth={0} aria-hidden />
          {product.rating.toFixed(1)}
          {product.reviewCount && ` (${formatCount(product.reviewCount)} reviews)`}
        </span>
      )}

      <div className={styles.priceBlock}>
        <span className={styles.price}>
          {product.priceIsEstimated && <span className={styles.estimate}>Est. </span>}
          {formatPriceRange(product.priceMin, product.priceMax)}
          <span className={styles.priceUnit}>/{product.priceUnit}</span>
        </span>
        {product.priceIsEstimated && (
          <span className={styles.moq}>Estimated price — confirm the final price with the seller.</span>
        )}
        {product.moq !== undefined && product.moqUnit && (
          <span className={styles.moq}>
            Min. Order: {formatCount(product.moq)} {product.moqUnit}
          </span>
        )}
      </div>

      {(product.categoryLabel || product.colour) && (
        <dl className={styles.attributes}>
          {product.categoryLabel && (
            <div className={styles.attribute}>
              <dt>Category</dt>
              <dd>{product.categoryLabel}</dd>
            </div>
          )}
          {product.colour && (
            <div className={styles.attribute}>
              <dt>Colour</dt>
              <dd>{product.colour}</dd>
            </div>
          )}
        </dl>
      )}

      {product.sizes && product.sizes.length > 0 && (
        <div className={styles.sizes}>
          <span className={styles.sizesLabel}>Sizes (estimated)</span>
          <ul className={styles.sizeList}>
            {product.sizes.map((size) => (
              <li key={size} className={styles.size}>
                {size}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.supplierCard}>
        <div className={styles.supplierNameRow}>
          <Link href={product.supplierHref} className={styles.supplierName}>
            {product.supplierName}
          </Link>
          {product.verified && <Badge variant="success" icon>Verified</Badge>}
        </div>
        {product.supplierType && <span className={styles.supplierMeta}>{product.supplierType}</span>}
        <span className={styles.supplierLocation}>
          <MapPin size={13} strokeWidth={2} aria-hidden />
          {product.supplierCity}, {product.supplierState}
        </span>
      </div>

      <a href="#get-best-quote" className={styles.cta}>
        <ShieldCheck size={16} strokeWidth={2} aria-hidden />
        Get Best Quote
      </a>
    </div>
  );
}
