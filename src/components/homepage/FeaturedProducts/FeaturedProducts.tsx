import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollSlider } from "@/components/ui/ScrollSlider";
import { ProductCard } from "@/components/category/ProductCard";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { emptyListingQuery, getProductListing } from "@/lib/catalog/categoryListing";
import type { ProductCardData } from "@/types";
import styles from "./FeaturedProducts.module.css";

const COUNT = 5;

/**
 * No "featured" rule exists, so this section does not claim one: it shows the first products of the public All Products listing in its default order (same engine and eligibility as /products:
 * catalogue products plus approved, published supplier products; sample listings are never shown here). A failed read says so, it is never presented as "no products".
 */
async function load(): Promise<ProductCardData[] | null> {
  try {
    await ensureApproved();
    const listing = getProductListing(emptyListingQuery(), { pageSize: COUNT * 3 });
    return listing.results.items.filter((item) => item.meta.source !== "sample").slice(0, COUNT).map((item) => item.card);
  } catch {
    return null;
  }
}

export async function FeaturedProducts() {
  const products = await load();
  return (
    <section className={styles.section} aria-labelledby="featured-products-heading">
      <Container>
        <SectionHeading
          eyebrow="Explore"
          title={<span id="featured-products-heading">Browse Products</span>}
          actionLabel="View All Products"
          actionHref="/products"
        />
        {products === null ? (
          <p role="status">Products could not be loaded right now. <Link prefetch={false} href="/products">Browse all products</Link> or try again shortly.</p>
        ) : products.length === 0 ? (
          <p>No products are listed yet. You can still <Link prefetch={false} href="/post-requirement">post your requirement</Link>.</p>
        ) : (
          <ScrollSlider label="products">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} view="grid" />
            ))}
          </ScrollSlider>
        )}
      </Container>
    </section>
  );
}
