import Link from "next/link";
import { Building2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollSlider } from "@/components/ui/ScrollSlider";
import { getSupplierListing, parseSupplierQuery } from "@/lib/catalog/supplierListing";
import type { Supplier } from "@/types";
import { SupplierCard } from "./SupplierCard";
import styles from "./FeaturedSuppliers.module.css";

const COUNT = 5;

/** No "featured" rule exists: the first suppliers of the public /suppliers directory in its default order (same service, so the same links and rules). A failed read is reported as such. */
function load(): Supplier[] | null {
  try {
    const listing = getSupplierListing(parseSupplierQuery({}), { pageSize: COUNT });
    return listing.results.items.slice(0, COUNT).map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      categoryLabel: s.categories[0] ?? s.industry,
      verified: s.verificationStatus === "verified",
      href: s.url,
      tile: { icon: Building2, tint: "blue" as const, imageSrc: s.image ?? undefined },
    }));
  } catch {
    return null;
  }
}

export function FeaturedSuppliers() {
  const suppliers = load();
  return (
    <section className={styles.section} aria-labelledby="suppliers-heading">
      <Container>
        <SectionHeading
          eyebrow="Explore"
          title={<span id="suppliers-heading">Browse Suppliers</span>}
          actionLabel="View All Suppliers"
          actionHref="/suppliers"
        />
        {suppliers === null ? (
          <p role="status">Suppliers could not be loaded right now. <Link href="/suppliers">Browse all suppliers</Link> or try again shortly.</p>
        ) : suppliers.length === 0 ? (
          <p>No suppliers are listed yet. You can still <Link href="/post-requirement">post your requirement</Link>.</p>
        ) : (
          <ScrollSlider label="suppliers">
            {suppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </ScrollSlider>
        )}
      </Container>
    </section>
  );
}
