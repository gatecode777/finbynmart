import Link from "next/link";
import { MapPin, Building2, Send, PackageSearch } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { MediaTile } from "@/components/ui/MediaTile";
import { Badge } from "@/components/ui/Badge";
import { SellerLogo } from "@/components/supplier/SellerLogo";
import type { SupplierProfile } from "@/types";
import styles from "./SupplierProfileCard.module.css";

export function SupplierProfileCard({ supplier }: { supplier: SupplierProfile }) {
  const usePlaceholderLogo = !supplier.tile.imageSrc && supplier.logoText;

  return (
    <Container>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          {usePlaceholderLogo ? (
            <SellerLogo name={supplier.name} size="lg" text={supplier.logoText} />
          ) : (
            <MediaTile tile={supplier.tile} alt={supplier.name} iconSize={40} />
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.titleRow}>
            <h2 className={styles.name}>{supplier.name}</h2>
            {supplier.verified && (
              <Badge variant="success" icon>
                Verified Supplier
              </Badge>
            )}
          </div>

          <div className={styles.metaRow}>
            {supplier.businessType && (
              <span className={styles.metaItem}>
                <Building2 size={14} strokeWidth={2} aria-hidden />
                {supplier.businessType}
              </span>
            )}
            <span className={styles.metaItem}>
              <MapPin size={14} strokeWidth={2} aria-hidden />
              {supplier.city}, {supplier.state}
            </span>
          </div>

          <p className={styles.description}>{supplier.description}</p>

          {supplier.mainCategories.length > 0 && (
            <div className={styles.categories}>
              {supplier.mainCategories.map((category) => (
                <Badge key={category} variant="neutral">
                  {category}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <Link href="#contact" className={styles.ctaPrimary}>
            <Send size={16} strokeWidth={2} aria-hidden />
            Send Inquiry
          </Link>
          <Link href="#products" className={styles.ctaSecondary}>
            <PackageSearch size={16} strokeWidth={2} aria-hidden />
            View Products
          </Link>
        </div>
      </div>
    </Container>
  );
}
