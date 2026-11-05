import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryPageView } from "@/components/inquiry/InquiryPageView";
import type { ProductOption } from "@/components/inquiry/InquiryWorkspace";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupplierProductListing, parseListingQuery } from "@/lib/catalog/categoryListing";
import { unitKey } from "@/lib/catalog/listingQuery";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { canonicalUnit } from "@/lib/inquiries/rules";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { getReviewHeadlineSafe } from "@/lib/reviews/store";
import { siteUrl } from "@/lib/site";
import { formatPriceRange } from "@/lib/utils/format";
import { first, type SearchParams } from "@/lib/utils/searchParams";
import { withPagePerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ supplierSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { supplierSlug } = await params;
  const supplier = getPublicSupplierBySlug(supplierSlug);
  if (!supplier) return { title: "Supplier not found | Finbyn Mart", robots: { index: false } };
  const base = siteUrl();
  // A personal workflow: kept out of search indexes. The canonical is the plain address (no product or other query).
  return {
    title: `Contact ${supplier.name} | Send Inquiry | Finbyn Mart`,
    description: `Send an inquiry or ask ${supplier.name} for a quote on Finbyn Mart.`,
    robots: { index: false, follow: false },
    ...(base ? { alternates: { canonical: `${base}/inquiry/${supplier.slug}` } } : {}),
  };
}

/** The offered label for a unit ("Meters" -> "Meter"); an unusual unit is shown as the record writes it. */
const unitLabel = (unit: string) => canonicalUnit(unit, unitKey) ?? unit;

async function InquiryPage({ params, searchParams }: Props) {
  const { supplierSlug } = await params;
  const supplier = getPublicSupplierBySlug(supplierSlug);
  if (!supplier) notFound();

  const productParam = first((await searchParams).product);
  const user = await getCurrentUser().catch(() => null);

  // The supplier's own products, to choose from (the first page of the shared listing engine, never the whole catalogue).
  const listing = getSupplierProductListing(supplier.slug, parseListingQuery({}), { pageSize: 50 });
  const toOption = (card: NonNullable<typeof listing>["results"]["items"][number]["card"]): ProductOption => ({
    id: card.id,
    slug: card.href.replace(/^\/products\//, ""),
    name: card.name,
    unit: unitLabel(card.moqUnit ?? card.priceUnit),
    moq: card.moq,
    moqUnit: card.moqUnit,
    priceText: formatPriceRange(card.priceMin, card.priceMax),
    estimated: Boolean(card.priceIsEstimated),
    imageSrc: card.tile.imageSrc,
    imageRemote: Boolean(card.tile.imageSrc && /^https?:\/\//.test(card.tile.imageSrc)),
  });
  const products = (listing?.results.items ?? []).map((item) => toOption(item.card));
  const moreProducts = (listing?.results.total ?? 0) > products.length;

  // A product named in the address must exist and be this supplier's. If not, nothing is substituted: the buyer is told.
  let initialProductId: string | undefined;
  let productNotice: string | undefined;
  if (productParam) {
    const detail = getPublicProductByKey(productParam);
    if (!detail || detail.supplier.slug !== supplier.slug) {
      productNotice = `The product in this link is not available from ${supplier.name}, so this is a General Inquiry. Choose Product Inquiry to pick one of their products.`;
    } else {
      initialProductId = detail.id;
      if (!products.some((item) => item.id === detail.id)) {
        const primary = detail.images.find((image) => image.primary) ?? detail.images[0];
        products.unshift({
          id: detail.id,
          slug: detail.slug,
          name: detail.name,
          unit: unitLabel(detail.moq?.unit ?? detail.pricing.unit),
          moq: detail.moq?.quantity,
          moqUnit: detail.moq?.unit,
          priceText: formatPriceRange(detail.pricing.min, detail.pricing.max),
          estimated: detail.pricing.type === "estimated",
          imageSrc: primary?.src,
          imageRemote: Boolean(primary?.remote),
        });
      }
    }
  }

  const headline = await getReviewHeadlineSafe(supplier.slug);

  return (
    <InquiryPageView
      supplier={supplier}
      products={products}
      moreProducts={moreProducts}
      initialProductId={initialProductId}
      productNotice={productNotice}
      viewer={user?.role === "buyer" ? { kind: "buyer", name: user.name, email: user.email } : { kind: "guest" }}
      rating={headline && headline.count > 0 && headline.average !== null ? { average: headline.average, count: headline.count } : undefined}
    />
  );
}

export default withPagePerf("page inquiry/:supplierSlug", InquiryPage);
