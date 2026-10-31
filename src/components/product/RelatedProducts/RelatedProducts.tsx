import { Container } from "@/components/ui/Container";
import { ProductCard } from "@/components/category/ProductCard";
import type { ProductCardData } from "@/types";
import styles from "./RelatedProducts.module.css";

export function RelatedProducts({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="related-products-heading">
      <Container>
        <h2 id="related-products-heading" className={styles.title}>
          More From This Category
        </h2>
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} view="grid" />
          ))}
        </div>
      </Container>
    </section>
  );
}
