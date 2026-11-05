import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, Boxes, Users } from "lucide-react";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import type { HeroStat } from "@/components/category/CategoryDetailHero";
import { getCategoryRecord, resolveCategoryRoute } from "@/lib/catalog/categories";
import { getCategoryListing, getSubcategoryInfo } from "@/lib/catalog/categoryListing";
import { listingHref, parseListingQuery } from "@/lib/catalog/listingQuery";
import { siteUrl } from "@/lib/site";
import { withPagePerf } from "@/lib/perf/instrument";

type Params = Promise<{ slug: string; subcategory: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryString(sp: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function describe(label: string, parent: string, info: { products: number; suppliers: number }, source: "catalog" | "sample"): string {
  const n = info.products.toLocaleString("en-IN");
  const s = info.suppliers.toLocaleString("en-IN");
  return source === "catalog"
    ? `Browse ${n} ${label} products from ${s} ${info.suppliers === 1 ? "supplier" : "suppliers"}. Compare estimated prices and request quotes.`
    : `Browse ${n} ${label} ${info.products === 1 ? "listing" : "listings"} from ${s} ${info.suppliers === 1 ? "supplier" : "suppliers"} in ${parent}. Compare prices and minimum order quantities and request quotes.`;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug, subcategory } = await params;
  const record = getCategoryRecord(slug);
  const info = record ? getSubcategoryInfo(slug, subcategory) : undefined;
  if (!record || !info) return { title: "Subcategory not found | Finbyn Mart", robots: { index: false } };

  const query = parseListingQuery(await searchParams);
  const base = siteUrl();
  const path = `/categories/${slug}/${subcategory}`;
  const filtered = listingHref(path, query, { page: 1 }) !== path;
  const title = `${info.label} — ${record.name} | Finbyn Mart`;
  const description = describe(info.label, record.name, info, record.source).slice(0, 200);
  const ogImage = info.imageSrc ?? record.imageSrc;
  const ogUrl = ogImage ? (/^https?:/.test(ogImage) ? ogImage : `${base}${ogImage}`) : undefined;

  return {
    title,
    description,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}${path}?page=${query.page}` : `${base}${path}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      ...(base ? { url: `${base}${path}`, ...(ogUrl ? { images: [{ url: ogUrl }] } : {}) } : {}),
    },
  };
}

async function SubcategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug, subcategory } = await params;
  const sp = await searchParams;

  // Parent: aliases forward to the canonical slug, unknown parents are not found.
  const route = resolveCategoryRoute(slug);
  if (route.type === "all") redirect("/categories");
  if (route.type === "none") notFound();
  if (route.type === "redirect") redirect(`/categories/${route.slug}/${subcategory}${queryString(sp)}`);

  const record = getCategoryRecord(slug);
  // The subcategory must exist, belong to this parent and have eligible products; otherwise it is not found
  // (a subcategory under the wrong parent never shows another category's products).
  const info = record ? getSubcategoryInfo(slug, subcategory) : undefined;
  if (!record || !info) notFound();

  const parentPath = `/categories/${slug}`;
  const basePath = `${parentPath}/${subcategory}`;
  const query = parseListingQuery(sp);
  const listing = getCategoryListing(slug, query, { sub: subcategory });
  if (!listing) notFound();

  const stats: HeroStat[] = [
    { label: "Products", value: info.products, icon: Boxes },
    info.verifiedSuppliers !== null
      ? { label: "Verified Suppliers", value: info.verifiedSuppliers, icon: BadgeCheck }
      : { label: "Suppliers", value: info.suppliers, icon: Users },
  ];

  const requirementHref = `/post-requirement?category=${encodeURIComponent(record.name)}&subcategory=${encodeURIComponent(info.label)}&product=${encodeURIComponent(info.label)}`;

  return (
    <CategoryListingPage
      basePath={basePath}
      query={query}
      listing={listing}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "All Categories", href: "/categories" },
        { label: record.name, href: parentPath },
        { label: info.label },
      ]}
      name={info.label}
      description={describe(info.label, record.name, info, record.source)}
      iconKey={record.iconKey}
      // A real product photo of this subcategory when there is one, otherwise the parent's approved image.
      imageSrc={info.imageSrc ?? record.imageSrc}
      imageRemote={info.imageSrc ? info.imageRemote : false}
      stats={stats}
      chipsLabel="Explore Subcategories:"
      chipsAllHref={parentPath}
      chipsAllLabel={`All ${record.name}`}
      chips={info.siblings.map((sibling) => ({
        label: sibling.label,
        href: `${parentPath}/${sibling.value}`,
        active: sibling.value === subcategory,
      }))}
      otherTitle="Other subcategories"
      others={info.siblings
        .filter((sibling) => sibling.value !== subcategory)
        .map((sibling) => ({ name: sibling.label, href: `${parentPath}/${sibling.value}`, count: sibling.count }))}
      cta={{
        heading: `Need ${info.label} in Bulk?`,
        description: "Tell us your requirements and get quotations from verified suppliers.",
        href: requirementHref,
      }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page categories/:slug/:subcategory", SubcategoryPage);
