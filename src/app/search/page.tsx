import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { ResultGrid } from "@/components/ui/ResultGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCard } from "@/components/category/ProductCard";
import { SellerCard } from "@/components/supplier/SellerCard";
import { listProducts, listSellers } from "@/lib/catalog/queries";
import { toProductCard } from "@/lib/catalog/mappers";
import { POPULAR_SEARCHES } from "@/lib/constants/navigation";
import { formatCount } from "@/lib/utils/format";
import { first, oneOf, type SearchParams } from "@/lib/utils/searchParams";
import styles from "./search.module.css";

export const metadata: Metadata = {
  title: "Search | Finbyn Mart",
  robots: { index: false },
};

const TYPES = ["products", "suppliers", "services"] as const;
const PRODUCT_LIMIT = 12;
const SELLER_LIMIT = 6;

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const type = oneOf(first(sp.type), TYPES) ?? "products";

  const crumbs = [{ label: "Home", href: "/" }, { label: "Search" }];

  if (!q) {
    return (
      <Container>
        <Breadcrumb items={crumbs} />
        <PageBody>
          <PageIntro title="Search" subtitle="Search products and suppliers using the search bar above." />
          <ul className={styles.chips}>
            {POPULAR_SEARCHES.map((term) => (
              <li key={term}>
                <Link href={`/search?q=${encodeURIComponent(term)}`} className={styles.chip}>
                  {term}
                </Link>
              </li>
            ))}
          </ul>
        </PageBody>
      </Container>
    );
  }

  if (type === "services") {
    return (
      <Container>
        <Breadcrumb items={crumbs} />
        <PageBody>
          <PageIntro title={`Results for “${q}”`} />
          <EmptyState
            title="Services aren't listed yet"
            actions={
              <>
                <Link href={`/search?type=products&q=${encodeURIComponent(q)}`}>Search products</Link>
                <Link href={`/search?type=suppliers&q=${encodeURIComponent(q)}`}>Search suppliers</Link>
              </>
            }
          >
            Only products and suppliers can be searched right now.
          </EmptyState>
        </PageBody>
      </Container>
    );
  }

  const products = listProducts({ q, pageSize: PRODUCT_LIMIT });
  const sellers = listSellers({ q, pageSize: SELLER_LIMIT });
  const encoded = encodeURIComponent(q);

  const productSection = (
    <section key="products" className={styles.section} aria-labelledby="search-products">
      <h2 id="search-products" className={styles.heading}>
        Products <span className={styles.count}>({formatCount(products.total)})</span>
      </h2>
      {products.items.length > 0 ? (
        <>
          <ResultGrid variant="product">
            {products.items.map((product) => (
              <ProductCard key={product.id} product={toProductCard(product)} view="grid" />
            ))}
          </ResultGrid>
          {products.total > PRODUCT_LIMIT && (
            <Link href={`/products?q=${encoded}`} className={styles.viewAll}>
              View all {formatCount(products.total)} products
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </>
      ) : (
        <p className={styles.none}>No products match “{q}”.</p>
      )}
    </section>
  );

  const sellerSection = (
    <section key="suppliers" className={styles.section} aria-labelledby="search-suppliers">
      <h2 id="search-suppliers" className={styles.heading}>
        Suppliers <span className={styles.count}>({formatCount(sellers.total)})</span>
      </h2>
      {sellers.items.length > 0 ? (
        <>
          <ResultGrid variant="seller">
            {sellers.items.map((seller) => (
              <SellerCard key={seller.id} seller={seller} />
            ))}
          </ResultGrid>
          {sellers.total > SELLER_LIMIT && (
            <Link href={`/suppliers?q=${encoded}`} className={styles.viewAll}>
              View all {formatCount(sellers.total)} suppliers
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </>
      ) : (
        <p className={styles.none}>No suppliers match “{q}”.</p>
      )}
    </section>
  );

  return (
    <Container>
      <Breadcrumb items={crumbs} />
      <PageBody>
        <PageIntro title={`Results for “${q}”`} />
        {type === "suppliers" ? [sellerSection, productSection] : [productSection, sellerSection]}
      </PageBody>
    </Container>
  );
}
