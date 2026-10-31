import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryHero } from "@/components/category/CategoryHero";
import { SubcategoryGrid } from "@/components/category/SubcategoryGrid";
import { ProductListingSection } from "@/components/category/ProductListingSection";
import { getCategoryPage } from "@/lib/constants/categoryPages";
import { TOP_CATEGORIES } from "@/lib/constants/categories";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryPage(slug);

  if (category) {
    return {
      title: `${category.name} — Suppliers & Manufacturers | Finbyn Mart`,
      description: category.description,
    };
  }

  const topCategory = TOP_CATEGORIES.find((item) => item.id === slug);
  return topCategory ? { title: `${topCategory.name} | Finbyn Mart` } : {};
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = getCategoryPage(slug);

  if (!category) {
    // A top-level category with no listings yet gets an honest empty page, not a 404.
    const topCategory = TOP_CATEGORIES.find((item) => item.id === slug);
    if (!topCategory) {
      notFound();
    }

    return (
      <Container>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "All Categories", href: "/categories" },
            { label: topCategory.name },
          ]}
        />
        <PageBody>
          <PageIntro title={topCategory.name} />
          <EmptyState
            title="No listings in this category yet"
            actions={
              <>
                <Link href="/post-requirement">Post a requirement</Link>
                <Link href="/categories">Browse other categories</Link>
              </>
            }
          >
            Suppliers haven&apos;t listed products in {topCategory.name} yet.
          </EmptyState>
        </PageBody>
      </Container>
    );
  }

  return (
    <>
      <Container>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: category.parentLabel, href: category.parentHref },
            { label: category.name },
          ]}
        />
      </Container>
      <CategoryHero category={category} />
      <SubcategoryGrid category={category} />
      <ProductListingSection
        products={category.products}
        subcategories={category.subcategories.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
