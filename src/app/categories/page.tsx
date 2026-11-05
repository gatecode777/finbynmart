import type { Metadata } from "next";
import { CategoriesHero } from "@/components/category/CategoriesHero";
import { CategoryExplorer } from "@/components/category/CategoryExplorer";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import { siteUrl } from "@/lib/site";
import { withPagePerf } from "@/lib/perf/instrument";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const base = siteUrl();
  // A selected category or a search is a view of this same page: one canonical URL, kept out of the index.
  const isView = Boolean(first(sp.c) || first(sp.q));
  return {
    title: "All Categories | Finbyn Mart",
    description:
      "Browse every product category on Finbyn Mart, search by name and open the category that matches what you need to source.",
    ...(base ? { alternates: { canonical: `${base}/categories` } } : {}),
    ...(isView ? { robots: { index: false, follow: true } } : {}),
  };
}

async function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { nodes, totals } = getCategoryDirectory();

  // Only a category that has children can be "explored"; ignore anything else in the URL.
  const requested = first(sp.c);
  const requestedNode = requested ? nodes.find((node) => node.id === requested) : undefined;
  const initialSelected = requestedNode && requestedNode.childIds.length > 0 ? requestedNode.id : null;
  const initialQuery = (first(sp.q) ?? "").slice(0, 80);

  const base = siteUrl() ?? "";
  const mains = nodes.filter((node) => node.parentId === null);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "All Categories", item: `${base}/categories` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Finbyn Mart product categories",
      itemListElement: mains.map((node, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: node.name,
        url: `${base}${node.href}`,
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD built from our own data; "<" is escaped so it can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <CategoriesHero totals={totals} />
      <CategoryExplorer nodes={nodes.map((node) => (node.source === "curated" ? node : { ...node, description: "" }))} initialSelected={initialSelected} initialQuery={initialQuery} />
      <TrustBenefits overlap={false} />
    </>
  );
}

export default withPagePerf("page categories", CategoriesPage);
