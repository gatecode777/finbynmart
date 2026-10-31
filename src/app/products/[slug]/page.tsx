import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ProductDetailSection } from "@/components/product/ProductDetailSection";
import { ProductInquirySection } from "@/components/product/ProductInquirySection";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { getProductBySlug } from "@/lib/constants/categoryPages";
import { getProductBySlug as getCatalogProductBySlug, getRelatedProducts } from "@/lib/catalog/queries";
import { toProductCard, toProductDetail } from "@/lib/catalog/mappers";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = getProductBySlug(slug);

  if (result) {
    return {
      title: `${result.product.name} — ${result.product.supplierName} | Finbyn Mart`,
      description: `${result.product.name} from ${result.product.supplierName}, ${result.product.supplierCity}. Get the best quote from verified suppliers on Finbyn Mart.`,
    };
  }

  const catalogProduct = getCatalogProductBySlug(slug);
  if (catalogProduct) {
    const detail = toProductDetail(catalogProduct);
    return {
      title: `${detail.name} — ${detail.supplierName} | Finbyn Mart`,
      description: `${detail.name} from ${detail.supplierName}, ${detail.supplierCity}. Request a quote on Finbyn Mart.`,
    };
  }

  return {};
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  const result = getProductBySlug(slug);
  if (result) {
    const { product, category } = result;
    const relatedProducts = category.products
      .filter((item) => item.subcategoryId === product.subcategoryId && item.id !== product.id)
      .slice(0, 4);

    return (
      <>
        <Container>
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: category.parentLabel, href: category.parentHref },
              { label: category.name, href: `/category/${category.slug}` },
              { label: product.name },
            ]}
          />
        </Container>
        <ProductDetailSection product={product} />
        <ProductInquirySection productName={product.name} />
        <RelatedProducts products={relatedProducts} />
      </>
    );
  }

  const catalogProduct = getCatalogProductBySlug(slug);
  if (!catalogProduct) {
    notFound();
  }
  // One canonical URL per product, whatever text precedes the id.
  if (catalogProduct.slug !== slug) {
    permanentRedirect(`/products/${catalogProduct.slug}`);
  }

  const product = toProductDetail(catalogProduct);
  const related = getRelatedProducts(catalogProduct).map(toProductCard);

  return (
    <>
      <Container>
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Products", href: "/products" },
            {
              label: catalogProduct.categoryName,
              href: `/products?category=${encodeURIComponent(catalogProduct.categoryName)}`,
            },
            { label: product.name },
          ]}
        />
      </Container>
      <ProductDetailSection product={product} />
      <ProductInquirySection productName={product.name} />
      <RelatedProducts products={related} />
    </>
  );
}
