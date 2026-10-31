import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SupplierHero } from "@/components/supplier/SupplierHero";
import { SupplierProfileCard } from "@/components/supplier/SupplierProfileCard";
import { SupplierTabs } from "@/components/supplier/SupplierTabs";
import { SupplierContentLayout } from "@/components/supplier/SupplierContentLayout";
import { SupplierOverview } from "@/components/supplier/SupplierOverview";
import { SupplierProductsGrid } from "@/components/supplier/SupplierProductsGrid";
import { SupplierGallery } from "@/components/supplier/SupplierGallery";
import { SupplierInquiryForm } from "@/components/supplier/SupplierInquiryForm";
import { SupplierInfoCard } from "@/components/supplier/SupplierInfoCard";
import { SupplierTrustStrip } from "@/components/supplier/SupplierTrustStrip";
import { getSupplierProfile } from "@/lib/constants/supplierProfiles";
import { getProductsBySupplier } from "@/lib/constants/categoryPages";
import { getSellerBySlug, getSellerProducts } from "@/lib/catalog/queries";
import { sellerToSupplierProfile, toProductCard } from "@/lib/catalog/mappers";
import type { ProductCardData, SupplierProfile } from "@/types";

interface SupplierPageProps {
  params: Promise<{ slug: string }>;
}

const CATALOG_PREVIEW_COUNT = 24;

interface ResolvedSupplier {
  supplier: SupplierProfile;
  products: ProductCardData[];
  totalCount?: number;
  viewAllHref?: string;
}

/** The hand-built sample profile wins for its slug; everything else comes from the catalog. */
function resolveSupplier(slug: string): ResolvedSupplier | undefined {
  const sample = getSupplierProfile(slug);
  if (sample) {
    return { supplier: sample, products: getProductsBySupplier(sample.href) };
  }

  const seller = getSellerBySlug(slug);
  if (!seller) return undefined;

  const all = getSellerProducts(seller.id);
  return {
    supplier: sellerToSupplierProfile(seller),
    products: all.slice(0, CATALOG_PREVIEW_COUNT).map(toProductCard),
    totalCount: all.length,
    viewAllHref: `/products?seller=${seller.slug}`,
  };
}

export async function generateMetadata({ params }: SupplierPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveSupplier(slug);

  if (!resolved) {
    return {};
  }

  const { supplier } = resolved;
  const kind = supplier.businessType ?? supplier.categoryLabel;
  return {
    title: `${supplier.name} — ${kind}, ${supplier.city} | Finbyn Mart`,
    description: supplier.description,
  };
}

export default async function SupplierPage({ params }: SupplierPageProps) {
  const { slug } = await params;
  const resolved = resolveSupplier(slug);

  if (!resolved) {
    notFound();
  }

  const { supplier, products, totalCount, viewAllHref } = resolved;

  return (
    <>
      <Container>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Suppliers", href: "/suppliers" },
            { label: supplier.name },
          ]}
        />
      </Container>
      <SupplierHero supplier={supplier} />
      <SupplierProfileCard supplier={supplier} />
      <SupplierTabs />
      <SupplierContentLayout
        main={
          <>
            <SupplierOverview supplier={supplier} />
            <SupplierProductsGrid products={products} totalCount={totalCount} viewAllHref={viewAllHref} />
            <SupplierGallery images={supplier.galleryImages ?? []} />
          </>
        }
        sidebar={
          <>
            <SupplierInquiryForm supplierId={supplier.id} supplierName={supplier.name} products={products} />
            <SupplierInfoCard supplier={supplier} />
          </>
        }
      />
      <SupplierTrustStrip verified={supplier.verified} />
    </>
  );
}
