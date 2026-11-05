import { Container } from "@/components/ui/Container";
import { ScrollSlider } from "@/components/ui/ScrollSlider";
import { ProductCard } from "@/components/category/ProductCard";
import type { ProductCardData } from "@/types";
import styles from "./RelatedProducts.module.css";

/** Related products in a slider: same subcategory first, then the same category. Hidden when there are none. */
export function RelatedProducts({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="related-products-heading">
      <Container>
        <h2 id="related-products-heading" className={styles.title}>
          Related Products
        </h2>
        <ScrollSlider label="related products">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} view="grid" />
          ))}
        </ScrollSlider>
      </Container>
    </section>
  );
}
