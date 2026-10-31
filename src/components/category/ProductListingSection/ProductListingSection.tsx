"use client";

import { useMemo, useState } from "react";
import { Container } from "@/components/ui/Container";
import { FilterSidebar } from "@/components/category/FilterSidebar";
import { ProductToolbar } from "@/components/category/ProductToolbar";
import { ProductCard } from "@/components/category/ProductCard";
import { applyFilters, defaultFilterState, sortProducts } from "@/lib/utils/productFilters";
import type { B2BProduct, SortOption, ViewMode } from "@/types";
import styles from "./ProductListingSection.module.css";

interface ProductListingSectionProps {
  products: B2BProduct[];
  subcategories: { id: string; name: string }[];
}

export function ProductListingSection({ products: allProducts, subcategories }: ProductListingSectionProps) {
  const [filters, setFilters] = useState(defaultFilterState());
  const [sort, setSort] = useState<SortOption>("relevance");
  const [view, setView] = useState<ViewMode>("grid");

  const products = useMemo(
    () => sortProducts(applyFilters(allProducts, filters), sort),
    [allProducts, filters, sort]
  );

  return (
    <section className={styles.section}>
      <Container>
        <div className={styles.layout}>
          <FilterSidebar
            subcategories={subcategories}
            products={allProducts}
            filters={filters}
            onChange={setFilters}
            onClearAll={() => setFilters(defaultFilterState())}
          />

          <div className={styles.main}>
            <ProductToolbar
              rangeStart={products.length > 0 ? 1 : 0}
              rangeEnd={products.length}
              total={products.length}
              sort={sort}
              onSortChange={setSort}
              view={view}
              onViewChange={setView}
            />

            {products.length > 0 ? (
              <div className={view === "grid" ? styles.grid : styles.list}>
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} view={view} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>No products match these filters. Try clearing some filters.</p>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
