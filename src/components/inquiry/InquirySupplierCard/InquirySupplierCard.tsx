import Link from "next/link";
import { Boxes, CalendarDays, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import { formatCount } from "@/lib/utils/format";
import styles from "./InquirySupplierCard.module.css";

/**
 * Who the inquiry goes to, from the supplier's own record: name, the verification badge only where a record says so,
 * type, location, membership year, product count and the rating only when published reviews exist. There is no
 * "years in business", response rate or capabilities data, so none of that is shown.
 */
export function InquirySupplierCard({ supplier, rating }: { supplier: SupplierDetail; rating?: { average: number; count: number } }) {
  const kind = [supplier.supplierType, supplier.industry].filter(Boolean).join(" • ");
  return (
    <section className={styles.card} aria-labelledby="inquiry-supplier-heading">
      <div className={styles.top}>
        <span className={styles.logo} aria-hidden>
          {supplier.initials}
        </span>
        <div className={styles.identity}>
          <h2 id="inquiry-supplier-heading" className={styles.name}>
            {supplier.name}
          </h2>
          {supplier.verificationStatus === "verified" && <Badge variant="success" icon>Verified Supplier</Badge>}
          {kind && <p className={styles.kind}>{kind}</p>}
        </div>
      </div>
      <ul className={styles.facts}>
        <li>
          <MapPin size={20} strokeWidth={1.75} aria-hidden />
          {supplier.city}, {supplier.state}
        </li>
        {supplier.memberSince && (
          <li>
            <CalendarDays size={20} strokeWidth={1.75} aria-hidden />
            Member since {supplier.memberSince}
          </li>
        )}
        <li>
          <Boxes size={20} strokeWidth={1.75} aria-hidden />
          {formatCount(supplier.productCount)} {supplier.productCount === 1 ? "Product" : "Products"}
        </li>
        {rating && (
          <li>
            <Star size={20} strokeWidth={1.75} aria-hidden />
            {rating.average.toFixed(1)} / 5 ({formatCount(rating.count)} {rating.count === 1 ? "Review" : "Reviews"})
          </li>
        )}
      </ul>
      <Link href={supplier.url} className={styles.profile}>
        View supplier profile
      </Link>
    </section>
  );
}
