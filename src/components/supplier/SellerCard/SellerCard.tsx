import Link from "next/link";
import { MapPin, Star, Boxes } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SellerLogo } from "@/components/supplier/SellerLogo";
import { formatCount } from "@/lib/utils/format";
import type { CatalogSeller } from "@/types";
import styles from "./SellerCard.module.css";

export function SellerCard({ seller }: { seller: CatalogSeller }) {
  const href = `/suppliers/${seller.slug}`;

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <SellerLogo name={seller.name} size="md" />
        <div className={styles.titleBlock}>
          <Link href={href} className={styles.name}>
            {seller.name}
          </Link>
          <span className={styles.location}>
            <MapPin size={12} strokeWidth={2} aria-hidden />
            {seller.city}, {seller.state}
          </span>
        </div>
      </div>

      <div>
        <Badge variant="neutral">{seller.specialization}</Badge>
      </div>

      <div className={styles.stats}>
        <span className={styles.stat}>
          <Star size={13} className={styles.star} fill="currentColor" strokeWidth={0} aria-hidden />
          {seller.rating.toFixed(1)}
        </span>
        <span className={styles.stat}>
          <Boxes size={13} strokeWidth={2} aria-hidden />
          {formatCount(seller.productCount)} products
        </span>
      </div>

      <Link href={href} className={styles.cta}>
        View Profile
      </Link>
    </article>
  );
}
