import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductCard } from "@/components/category/ProductCard";
import { FEATURED_PRODUCTS } from "@/lib/constants/featuredProducts";
import styles from "./FeaturedProducts.module.css";

export function FeaturedProducts() {
  return (
    <section className={styles.section} aria-labelledby="featured-products-heading">
      <Container>
        <SectionHeading
          eyebrow="Featured"
          title={<span id="featured-products-heading">Featured Products</span>}
        />
        <div className={styles.grid}>
          {FEATURED_PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} view="grid" />
          ))}
        </div>
      </Container>
    </section>
  );
}
