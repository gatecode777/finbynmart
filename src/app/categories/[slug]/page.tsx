import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, Boxes, LayoutGrid, Users } from "lucide-react";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import type { HeroStat } from "@/components/category/CategoryDetailHero";
import { getCategoryDirectory, getCategoryRecord, resolveCategoryRoute } from "@/lib/catalog/categories";
import { getCategoryListing } from "@/lib/catalog/categoryListing";
import { listingHref, parseListingQuery } from "@/lib/catalog/listingQuery";
import { siteUrl } from "@/lib/site";
import { withPagePerf } from "@/lib/perf/instrument";

type Params = Promise<{ slug: string }>;
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

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug } = await params;
  const record = getCategoryRecord(slug);
  if (!record) return { title: "Category not found | Finbyn Mart", robots: { index: false } };

  const query = parseListingQuery(await searchParams);
  const base = siteUrl();
  const path = `/categories/${slug}`;
  const filtered = listingHref(path, query, { page: 1 }) !== path;
  const title = `${record.name} — Products & Suppliers | Finbyn Mart`;
  const description = record.description.slice(0, 200);

  return {
    title,
    description,
    // Filtered and sorted views are the same page under another URL: one canonical, kept out of the index.
    // Plain pagination keeps its own canonical so every page of results can be found.
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}${path}?page=${query.page}` : `${base}${path}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      ...(base ? { url: `${base}${path}`, ...(record.imageSrc ? { images: [{ url: `${base}${record.imageSrc}` }] } : {}) } : {}),
    },
  };
}

async function CategoryDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const route = resolveCategoryRoute(slug);
  if (route.type === "all") redirect("/categories");
  if (route.type === "none") notFound();
  if (route.type === "redirect") redirect(`/categories/${route.slug}${queryString(sp)}`);

  const basePath = `/categories/${slug}`;
  const query = parseListingQuery(sp);
  const listing = getCategoryListing(slug, query);
  if (!listing) notFound();

  const { record, totals, chips } = listing;
  if (!record) notFound();
  const requirementHref = `/post-requirement?category=${encodeURIComponent(record.name)}&product=${encodeURIComponent(record.name)}`;

  const stats: HeroStat[] = [
    { label: "Products", value: totals.products, icon: Boxes },
    totals.verifiedSuppliers !== null
      ? { label: "Verified Suppliers", value: totals.verifiedSuppliers, icon: BadgeCheck }
      : { label: "Suppliers", value: totals.suppliers, icon: Users },
    { label: "Subcategories", value: totals.subcategories, icon: LayoutGrid },
  ];

  return (
    <CategoryListingPage
      basePath={basePath}
      query={query}
      listing={listing}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "All Categories", href: "/categories" },
        { label: record.name },
      ]}
      name={record.name}
      description={record.description}
      iconKey={record.iconKey}
      imageSrc={record.imageSrc}
      stats={stats}
      // Each popular subcategory has its own page (Page 04), so a chip navigates there.
      chips={chips.map((chip) => ({ label: chip.label, href: `${basePath}/${chip.value}`, active: false }))}
      chipsLabel="Popular Subcategories"
      otherTitle="Other categories"
      others={getCategoryDirectory()
        .nodes.filter((node) => node.parentId === null && node.id !== record.id)
        .map((node) => ({ name: node.name, href: node.href, count: node.productCount }))}
      cta={{
        heading: "Looking for Bulk Supply or Custom Requirement?",
        description: "Get quotes from verified suppliers for your specific needs.",
        href: requirementHref,
      }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page categories/:slug", CategoryDetailPage);
