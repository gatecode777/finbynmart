import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { FilterBar } from "@/components/ui/FilterBar";
import { ResultGrid } from "@/components/ui/ResultGrid";
import { ResultSummary } from "@/components/ui/ResultSummary";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCard } from "@/components/category/ProductCard";
import { getCatalogTotals, getProductFacets, getSellerBySlug, listProducts } from "@/lib/catalog/queries";
import { toProductCard } from "@/lib/catalog/mappers";
import { formatCount } from "@/lib/utils/format";
import { first, oneOf, toInt, type SearchParams } from "@/lib/utils/searchParams";

export const metadata: Metadata = {
  title: "Browse Products | Finbyn Mart",
  description: "Browse apparel products from suppliers on Finbyn Mart by category, colour and price.",
};

const PAGE_SIZE = 24;
const SORTS = ["relevance", "price-asc", "price-desc", "name"] as const;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const department = first(sp.department);
  const category = first(sp.category);
  const colour = first(sp.colour);
  const minPrice = toInt(first(sp.minPrice));
  const maxPrice = toInt(first(sp.maxPrice));
  const sort = oneOf(first(sp.sort), SORTS);
  const sellerSlug = first(sp.seller);
  const seller = sellerSlug ? getSellerBySlug(sellerSlug) : undefined;

  const facets = getProductFacets();
  const totals = getCatalogTotals();
  const result = listProducts({
    q,
    department,
    category,
    colour,
    sellerId: seller?.id,
    minPrice,
    maxPrice,
    sort,
    page: toInt(first(sp.page)),
    pageSize: PAGE_SIZE,
  });

  const categoryOptions = facets.categories.filter((c) => !department || c.department === department);

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Products" }]} />
      <PageBody>
        <PageIntro
          title="Browse Products"
          subtitle={`${formatCount(totals.products)} apparel products from ${formatCount(totals.sellers)} sellers. Prices shown are estimates.`}
        />

        {seller && (
          <p>
            Showing products from <strong>{seller.name}</strong>.{" "}
            <Link href="/products">Show all products</Link>
          </p>
        )}

        <FilterBar
          action="/products"
          resetHref={seller ? `/products?seller=${seller.slug}` : "/products"}
          hidden={{ seller: seller?.slug }}
          fields={[
            { kind: "search", name: "q", label: "Search", placeholder: "Product, brand or colour", value: q },
            {
              kind: "select",
              name: "department",
              label: "Department",
              value: department,
              options: [
                { label: "All departments", value: "" },
                ...facets.departments.map((f) => ({ label: `${f.name} (${formatCount(f.count)})`, value: f.name })),
              ],
            },
            {
              kind: "select",
              name: "category",
              label: "Category",
              value: category,
              options: [
                { label: "All categories", value: "" },
                ...categoryOptions.map((f) => ({ label: `${f.name} (${formatCount(f.count)})`, value: f.name })),
              ],
            },
            {
              kind: "select",
              name: "colour",
              label: "Colour",
              value: colour,
              options: [
                { label: "All colours", value: "" },
                ...facets.colours.map((f) => ({ label: `${f.name} (${formatCount(f.count)})`, value: f.name })),
              ],
            },
            { kind: "number", name: "minPrice", label: "Min price (₹)", placeholder: "0", value: minPrice?.toString() },
            { kind: "number", name: "maxPrice", label: "Max price (₹)", placeholder: "Any", value: maxPrice?.toString() },
            {
              kind: "select",
              name: "sort",
              label: "Sort by",
              value: sort,
              options: [
                { label: "Featured", value: "relevance" },
                { label: "Price: low to high", value: "price-asc" },
                { label: "Price: high to low", value: "price-desc" },
                { label: "Name A–Z", value: "name" },
              ],
            },
          ]}
        />

        <ResultSummary page={result.page} pageSize={PAGE_SIZE} total={result.total} noun="products" />

        {result.items.length > 0 ? (
          <ResultGrid variant="product">
            {result.items.map((product) => (
              <ProductCard key={product.id} product={toProductCard(product)} view="grid" />
            ))}
          </ResultGrid>
        ) : (
          <EmptyState title="No products match these filters" actions={<Link href="/products">Clear filters</Link>}>
            Try a different search or widen the price range.
          </EmptyState>
        )}

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          basePath="/products"
          params={{
            q,
            department,
            category,
            colour,
            sort,
            seller: seller?.slug,
            minPrice: minPrice?.toString(),
            maxPrice: maxPrice?.toString(),
          }}
        />
      </PageBody>
    </Container>
  );
}
