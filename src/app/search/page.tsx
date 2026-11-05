import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Layers3, Users } from "lucide-react";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import { RelatedSearches } from "@/components/category/RelatedSearches";
import { Container } from "@/components/ui/Container";
import { PageHero } from "@/components/ui/PageHero";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import { MAX_QUERY_LENGTH, PRODUCTS_PAGE_SIZE, getProductListing, parseListingQuery } from "@/lib/catalog/categoryListing";
import { getRelatedSearches } from "@/lib/catalog/publicProduct";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCount } from "@/lib/utils/format";
import { first, type SearchParams } from "@/lib/utils/searchParams";
import styles from "./search.module.css";
import { withPagePerf } from "@/lib/perf/instrument";

const HERO_IMAGE = { src: "/images/industries/retail-wholesale.jpg", alt: "A warehouse aisle with stocked shelving" };
const crumbs = [{ label: "Home", href: "/" }, { label: "Search Results" }];

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { q } = parseListingQuery(await searchParams);
  // Search result pages depend on what was typed: they are not indexed, but their links are followed.
  return {
    title: q ? `Search results for “${q}” | Finbyn Mart` : "Search Products | Finbyn Mart",
    description: q ? `Products matching “${q}” from suppliers on Finbyn Mart. Compare prices and request quotes.` : "Search products and suppliers on Finbyn Mart.",
    robots: { index: false, follow: true },
  };
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const type = first(sp.type);

  // Supplier search belongs to the suppliers page.
  if (type === "suppliers") {
    const q = parseListingQuery(sp).q;
    redirect(q ? `/suppliers?q=${encodeURIComponent(q)}` : "/suppliers");
  }

  const query = parseListingQuery(sp);
  const rawLength = (first(sp.q) ?? "").trim().length;
  const mains = getCategoryDirectory().nodes.filter((node) => node.parentId === null);

  // Services are not listed yet.
  if (type === "services") {
    return (
      <Container>
        <div className={styles.state}>
          <EmptyState
            title="Services aren't listed yet"
            actions={
              <Link href={query.q ? `/search?q=${encodeURIComponent(query.q)}` : "/search"} className={styles.link}>
                Search products
              </Link>
            }
          >
            Only products and suppliers can be searched right now.
          </EmptyState>
        </div>
      </Container>
    );
  }

  // Empty query: say what to do, and offer the real categories.
  if (!query.q) {
    return (
      <>
        <PageHero
          breadcrumbs={crumbs}
          eyebrow="Search Products"
          title="What are you"
          accent="looking for?"
          headingId="search-heading"
          compact
          description="Type a product name or keyword in the search bar above, or start from a category."
          stats={[]}
          image={HERO_IMAGE}
        />
        <Container>
          <section className={styles.state} aria-labelledby="browse-heading">
            <h2 id="browse-heading" className={styles.stateTitle}>
              Browse categories
            </h2>
            <ul className={styles.chips}>
              {mains.map((node) => (
                <li key={node.id}>
                  <Link href={node.href} className={styles.chip}>
                    {node.name} <span className={styles.chipCount}>({formatCount(node.productCount)})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </Container>
      </>
    );
  }

  const listing = getProductListing(query, { pageSize: PRODUCTS_PAGE_SIZE });
  const { applied, search } = listing;
  const found = search?.products ?? 0;
  const related = getRelatedSearches(applied.q, search);

  const oneCategory = applied.category.length === 1 ? listing.facets.categories.find((o) => o.value === applied.category[0])?.label : undefined;
  const requirement = new URLSearchParams({ product: applied.q });
  if (oneCategory) requirement.set("category", oneCategory);
  const requirementHref = `/post-requirement?${requirement}`;

  return (
    <CategoryListingPage
      basePath="/search"
      query={query}
      listing={listing}
      breadcrumbs={crumbs}
      name="Search results"
      heading="All Results"
      countLabel="Products"
      filtersVariant="global"
      hero={
        <PageHero
          breadcrumbs={crumbs}
          eyebrow="Search Results For"
          accent={`“${applied.q}”`}
          headingId="search-heading"
          compact={applied.q.length > 16}
          description={
            found > 0 && search
              ? `Found ${plural(search.products, "product", "products")}, ${plural(search.suppliers, "supplier", "suppliers")} and ${plural(search.categories, "category", "categories")} matching your search.`
              : "No products match your search."
          }
          stats={
            found > 0 && search
              ? [
                  { label: search.products === 1 ? "Product" : "Products", value: search.products, icon: Boxes },
                  { label: search.suppliers === 1 ? "Supplier" : "Suppliers", value: search.suppliers, icon: Users },
                  { label: search.categories === 1 ? "Category" : "Categories", value: search.categories, icon: Layers3 },
                ]
              : []
          }
          image={HERO_IMAGE}
        />
      }
      search={
        <>
          {rawLength > MAX_QUERY_LENGTH && (
            <Container>
              <p className={styles.notice} role="status">
                Your search was longer than {MAX_QUERY_LENGTH} characters, so it was shortened.
              </p>
            </Container>
          )}
          <RelatedSearches terms={related} />
        </>
      }
      noMatchHint={
        found === 0 ? (
          <>
            <span>No matching products were found for “{applied.q}”. Check the spelling, try a more general word, or start from a category.</span>
            <span className={styles.hintLinks}>
              {mains.map((node) => (
                <Link key={node.id} href={node.href} className={styles.chip}>
                  {node.name}
                </Link>
              ))}
            </span>
          </>
        ) : undefined
      }
      cta={{
        heading: `Need a Custom Quote for “${applied.q}”?`,
        description: "Share your exact requirement and get quotes from suppliers.",
        href: requirementHref,
      }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page search", SearchPage);
