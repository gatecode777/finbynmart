import Image from "next/image";
import Link from "next/link";
import { Boxes, CalendarDays, MapPin } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { SupplierWishlistButton } from "@/components/ui/WishlistButton";
import { formatCount } from "@/lib/utils/format";
import type { SupplierItem } from "@/lib/catalog/supplierListing";
import styles from "./SupplierListCard.module.css";

/**
 * Supplier card for the directory. Shows only what the record holds: initials as the logo (no genuine logos
 * exist), the specialisation and the supplier's own most common product categories, location, the real product
 * count and the membership year. The photo is one of the supplier's own products. A "Verified" badge appears only
 * where a record says so (none does today); there is no rating, years-in-business or supplier-type claim.
 * The whole card opens the profile; the heart and the two buttons stay separate controls above it.
 */
export function SupplierListCard({ supplier, view = "grid" }: { supplier: SupplierItem; view?: "grid" | "list" }) {
  return (
    <article className={clsx(styles.card, view === "list" && styles.listCard)}>
      <SupplierWishlistButton supplierId={supplier.id} supplierName={supplier.name} />

      <div className={styles.top}>
        <span className={styles.logo} aria-hidden>
          {supplier.initials}
        </span>
        <div className={styles.head}>
          <Link href={supplier.url} className={styles.name}>
            {supplier.name}
          </Link>
          {supplier.verificationStatus === "verified" && <Badge variant="success" icon>Verified Supplier</Badge>}
          <p className={styles.desc}>
            <strong>{supplier.industry}</strong>
            {supplier.categories.length > 0 && <> · {supplier.categories.join(", ")}</>}
          </p>
        </div>
        {supplier.image && (
          <span className={styles.photo}>
            <Image src={supplier.image} alt={`A product from ${supplier.name}`} fill sizes="140px" unoptimized className={styles.photoImage} />
          </span>
        )}
      </div>

      <ul className={styles.meta}>
        <li>
          <MapPin size={15} strokeWidth={2} aria-hidden />
          {supplier.city}, {supplier.state}
        </li>
        <li>
          <CalendarDays size={15} strokeWidth={2} aria-hidden />
          Member since {supplier.memberSince}
        </li>
        <li>
          <Boxes size={15} strokeWidth={2} aria-hidden />
          {formatCount(supplier.productCount)} {supplier.productCount === 1 ? "Product" : "Products"}
        </li>
      </ul>

      <div className={styles.actions}>
        <Link href={supplier.url} className={styles.primary}>
          View Profile
        </Link>
        <Link href={`${supplier.url}#contact`} className={styles.secondary}>
          Contact Supplier
        </Link>
      </div>
    </article>
  );
}
