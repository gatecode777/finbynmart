import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FEATURED_SUPPLIERS } from "@/lib/constants/suppliers";
import { SupplierCard } from "./SupplierCard";
import styles from "./FeaturedSuppliers.module.css";

export function FeaturedSuppliers() {
  return (
    <section className={styles.section} aria-labelledby="suppliers-heading">
      <Container>
        <SectionHeading
          eyebrow="Featured"
          title={<span id="suppliers-heading">Featured Suppliers</span>}
          actionLabel="View All Suppliers"
          actionHref="/suppliers"
        />
        <div className={styles.grid}>
          {FEATURED_SUPPLIERS.map((supplier) => (
            <SupplierCard key={supplier.id} supplier={supplier} />
          ))}
        </div>
      </Container>
    </section>
  );
}
