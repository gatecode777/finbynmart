import { Container } from "@/components/ui/Container";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductInfo } from "@/components/product/ProductInfo";
import type { ProductDetailData } from "@/types";
import styles from "./ProductDetailSection.module.css";

export function ProductDetailSection({ product }: { product: ProductDetailData }) {
  return (
    <section className={styles.section}>
      <Container>
        <div className={styles.grid}>
          <ProductGallery product={product} />
          <ProductInfo product={product} />
        </div>
      </Container>
    </section>
  );
}
