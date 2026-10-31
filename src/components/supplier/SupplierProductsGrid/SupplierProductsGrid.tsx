import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import { ProductCard } from "@/components/category/ProductCard";
import { formatCount } from "@/lib/utils/format";
import type { ProductCardData } from "@/types";
import styles from "./SupplierProductsGrid.module.css";

interface SupplierProductsGridProps {
  products: ProductCardData[];
  /** Total products this supplier has when `products` is only the first page of them. */
  totalCount?: number;
  viewAllHref?: string;
}

export function SupplierProductsGrid({ products, totalCount, viewAllHref }: SupplierProductsGridProps) {
  if (products.length === 0) {
    return null;
  }

  const hasMore = viewAllHref && totalCount !== undefined && totalCount > products.length;

  return (
    <section id="products" className={styles.section} aria-labelledby="products-heading">
      <h2 id="products-heading" className={styles.heading}>
        <Boxes size={18} strokeWidth={2} aria-hidden />
        Featured Products
      </h2>
      <div className={styles.grid}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} view="grid" />
        ))}
      </div>
      {hasMore && (
        <Link href={viewAllHref} className={styles.viewAll}>
          View all {formatCount(totalCount)} products
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      )}
    </section>
  );
}
