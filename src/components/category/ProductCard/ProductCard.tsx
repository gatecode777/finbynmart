import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import clsx from "clsx";
import { MediaTile } from "@/components/ui/MediaTile";
import { Badge } from "@/components/ui/Badge";
import { CompareButton } from "@/components/ui/CompareButton";
import { WishlistButton } from "@/components/ui/WishlistButton";
import { formatPriceRange, formatCount } from "@/lib/utils/format";
import type { ProductCardData, ViewMode } from "@/types";
import styles from "./ProductCard.module.css";

export function ProductCard({ product, view, inquiry = false }: { product: ProductCardData; view: ViewMode; /** Also offers "Add Inquiry" (a written question) next to the quote button. */ inquiry?: boolean }) {
  const hasPhoto = Boolean((product.tile as { imageSrc?: string }).imageSrc);
  return (
    <article className={clsx(styles.card, view === "list" && styles.listCard)}>
      <div className={styles.tileWrap}>
        {/* With no photo the tile is the light mint one (the dark gradient read as a broken image) */}
        <MediaTile tile={hasPhoto ? product.tile : { ...product.tile, tint: "blue" }} alt={product.name} iconSize={30} />
        {!hasPhoto && <span className={styles.noPhoto}>Photo not added yet</span>}
        <WishlistButton productId={product.id} productName={product.name} />
        <CompareButton productId={product.id} productName={product.name} variant="icon" />
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

        {inquiry ? (
          <div className={styles.ctaRow}>
            <Link href={`${product.href}#get-best-quote`} className={styles.cta}>
              Get Best Quote
            </Link>
            <Link href={`${product.href}#send-inquiry`} className={styles.ctaSecondary}>
              Add Inquiry
            </Link>
          </div>
        ) : (
          <Link href={`${product.href}#get-best-quote`} className={styles.cta}>
            Get Best Quote
          </Link>
        )}
      </div>
    </article>
  );
}
