import { Info, Building2, MapPin, Boxes, Truck, CalendarDays, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SupplierProfile } from "@/types";
import styles from "./SupplierInfoCard.module.css";

interface Row {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function SupplierInfoCard({ supplier }: { supplier: SupplierProfile }) {
  // Rows with no data are skipped rather than filled with made-up values.
  const candidates: (Row | false | undefined)[] = [
    supplier.businessType && { icon: Building2, label: "Business Type", value: supplier.businessType },
    { icon: MapPin, label: "Location", value: `${supplier.city}, ${supplier.state}` },
    supplier.mainCategories.length > 0 && {
      icon: Boxes,
      label: "Main Products",
      value: supplier.mainCategories.join(", "),
    },
    supplier.supplyType &&
      supplier.supplyType.length > 0 && {
        icon: Truck,
        label: "Supply Type",
        value: supplier.supplyType.join(", "),
      },
    supplier.memberSince ? { icon: CalendarDays, label: "Seller Since", value: supplier.memberSince } : undefined,
    supplier.rating !== undefined && { icon: Star, label: "Rating", value: `${supplier.rating.toFixed(1)} / 5` },
  ];
  const rows = candidates.filter((row): row is Row => Boolean(row));

  return (
    <section id="business-details" className={styles.card} aria-labelledby="info-heading">
      <h2 id="info-heading" className={styles.heading}>
        <Info size={18} strokeWidth={2} aria-hidden />
        Company Information
      </h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.label}>
              <row.icon size={15} strokeWidth={2} aria-hidden />
              {row.label}
            </dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
