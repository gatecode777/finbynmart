import { Package, ShieldCheck, Factory, BadgeCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { MediaTile } from "@/components/ui/MediaTile";
import type { SupplierProfile } from "@/types";
import styles from "./SupplierHero.module.css";

export function SupplierHero({ supplier }: { supplier: SupplierProfile }) {
  const highlights = [
    { icon: Package, label: "Wide Product Range" },
    supplier.businessType === "Manufacturer" && { icon: Factory, label: "Quality Manufacturing" },
    supplier.supplyType?.includes("Bulk Supply") && { icon: BadgeCheck, label: "Bulk Supply Ready" },
    supplier.verified && { icon: ShieldCheck, label: "Trusted by Businesses" },
  ].filter((item): item is { icon: typeof Package; label: string } => Boolean(item));

  return (
    <section className={styles.hero} aria-labelledby="supplier-hero-heading">
      <Container>
        <div className={styles.grid}>
          <div className={styles.textCol}>
            <h1 id="supplier-hero-heading" className={styles.heading}>
              {supplier.headline ?? `Quality ${supplier.categoryLabel} for a Better Tomorrow`}
            </h1>
            <p className={styles.description}>{supplier.description}</p>
            {highlights.length > 0 && (
              <ul className={styles.highlights}>
                {highlights.map((item) => (
                  <li key={item.label} className={styles.highlight}>
                    <item.icon size={16} strokeWidth={2} aria-hidden />
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.imageCol}>
            <MediaTile
              tile={{ ...supplier.tile, imageSrc: supplier.heroImageSrc }}
              alt={`${supplier.name} — ${supplier.categoryLabel}`}
              iconSize={48}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
