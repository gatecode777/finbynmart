import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { MediaTile } from "@/components/ui/MediaTile";
import type { CategoryPageData } from "@/types";
import styles from "./SubcategoryGrid.module.css";

export function SubcategoryGrid({ category }: { category: CategoryPageData }) {
  return (
    <section className={styles.section} aria-labelledby="subcategories-heading">
      <Container>
        <h2 id="subcategories-heading" className={styles.title}>
          Popular Subcategories
        </h2>
        <div className={styles.row}>
          {category.subcategories.map((subcategory) => {
            const productCount = category.products.filter(
              (product) => product.subcategoryId === subcategory.id
            ).length;

            return (
              <Link key={subcategory.id} href={subcategory.href} className={styles.card}>
                <div className={styles.tileWrap}>
                  <MediaTile tile={subcategory} alt={subcategory.name} iconSize={26} />
                </div>
                <span className={styles.name}>{subcategory.name}</span>
                {productCount > 0 && (
                  <span className={styles.count}>{productCount} products</span>
                )}
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
