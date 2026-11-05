import type { Metadata } from "next";
import { Boxes, Layers3, Users } from "lucide-react";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import { PageHero } from "@/components/ui/PageHero";
import { SearchPanel } from "@/components/ui/SearchPanel";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import { PRODUCTS_PAGE_SIZE, getProductListing, listingHref, listingParams, parseListingQuery, type ListingQuery } from "@/lib/catalog/categoryListing";
import { getSellerBySlug } from "@/lib/catalog/queries";
import { slugify } from "@/lib/catalog/slug";
import { siteUrl } from "@/lib/site";
import type { SearchParams } from "@/lib/utils/searchParams";
import { withPagePerf } from "@/lib/perf/instrument";

const TITLE = "All Products — Browse Products from Suppliers | Finbyn Mart";
const DESCRIPTION =
  "Browse products from suppliers across multiple industries and categories. Search by name or keyword, filter by category, price, MOQ and location, and request quotes.";

/**
 * Older links used `?category=<name>` for a product category such as "Men Tshirts" (the product page
 * breadcrumb) and now `category` means a main category id. A value that is not a main category is read
 * as a subcategory, so those links keep working.
 */
function withLegacyCategory(query: ListingQuery): ListingQuery {
  const mains = new Set(getCategoryDirectory().nodes.filter((node) => node.parentId === null).map((node) => node.id));
  const legacy = query.category.filter((value) => !mains.has(value)).map(slugify);
  if (legacy.length === 0) return query;
  return { ...query, category: query.category.filter((value) => mains.has(value)), sub: [...new Set([...query.sub, ...legacy])] };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const query = parseListingQuery(await searchParams);
  const base = siteUrl();
  // Search, filters, sort, list view and page size are the same listing under another URL: one canonical, kept
  // out of the index. Plain pagination keeps its own canonical so every page of results can be found.
  const filtered = listingHref("/products", query, { page: 1 }) !== "/products";
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}/products?page=${query.page}` : `${base}/products` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", ...(base ? { url: `${base}/products` } : {}) },
  };
}

async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = withLegacyCategory(parseListingQuery(await searchParams));
  const listing = getProductListing(query, { pageSize: PRODUCTS_PAGE_SIZE });
  const { applied, totals, facets } = listing;

  const sellerName = applied.seller ? (getSellerBySlug(applied.seller)?.name ?? listing.results.items[0]?.card.supplierName) : undefined;

  // The requirement form opens with what the buyer was looking for.
  const oneCategory = applied.category.length === 1 ? facets.categories.find((option) => option.value === applied.category[0])?.label : undefined;
  const requirement = new URLSearchParams();
  if (applied.q) requirement.set("product", applied.q);
  if (oneCategory) requirement.set("category", oneCategory);
  const requirementHref = requirement.size ? `/post-requirement?${requirement}` : "/post-requirement";

  const breadcrumbs = [{ label: "Home", href: "/" }, { label: "Products" }];

  return (
    <CategoryListingPage
      basePath="/products"
      query={query}
      listing={listing}
      breadcrumbs={breadcrumbs}
      name="All"
      heading="All Products"
      filtersVariant="global"
      sellerName={sellerName}
      hero={
        <PageHero
          breadcrumbs={breadcrumbs}
          eyebrow="Explore Our Product Range"
          title="All"
          accent="Products"
          headingId="products-heading"
          description="Browse a wide range of products from suppliers across multiple industries and categories."
          stats={[
            { label: totals.products === 1 ? "Product" : "Products", value: totals.products, icon: Boxes },
            { label: totals.suppliers === 1 ? "Supplier" : "Suppliers", value: totals.suppliers, icon: Users },
            { label: totals.categories === 1 ? "Category" : "Categories", value: totals.categories, icon: Layers3 },
          ]}
          image={{ src: "/images/industries/retail-wholesale.jpg", alt: "A warehouse aisle with stocked shelving" }}
        />
      }
      search={
        <SearchPanel
          action="/products"
          label="Search Products"
          placeholder="Enter product name, brand, model or keyword (e.g. T-Shirt, Air Compressor, Corrugated Box...)"
          value={applied.q}
          hidden={listingParams(applied, { q: "", page: 1 })}
        />
      }
      noMatchHint={
        applied.q
          ? `Nothing matches “${applied.q}”. Check the spelling, try a more general word, remove a filter, or post your requirement and suppliers will respond.`
          : undefined
      }
      cta={{
        heading: "Can't Find the Right Product?",
        description: "Post your requirement and get quotes from suppliers in minutes.",
        href: requirementHref,
      }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page products", ProductsPage);
