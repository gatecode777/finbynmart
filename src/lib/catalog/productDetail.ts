import { getCategoryPage, getProductBySlug as getSampleProduct, getProductsBySupplier } from "@/lib/constants/categoryPages";
import type { B2BProduct, BreadcrumbItem, CatalogProduct, CatalogSeller } from "@/types";
import { canonicalCategorySlug, getCategoryRecord } from "./categories";
import { getCatalog, ADOPTED_SELLERS, adoptedSeller, sampleListingCount } from "./data";
import type { ListingItem } from "./categoryListing";
import { toProductCard } from "./mappers";
import { initials, slugify } from "./slug";
import { getProductBySlug as getCatalogProductBySlug } from "./queries";
import { normalizeImage } from "./publicProduct";
import { hasSupplierProfile } from "./supplierDetail";

/**
 * Server-only. The public product detail: one normalised DTO for catalog products and sample B2B listings.
 * Only fields that exist in a record are filled; every other section is empty (never invented), and the
 * page hides or explains it. There is no description, brand, document, video, review, availability or
 * technical-detail data anywhere in the project yet, so those lists are empty for every product.
 */
export interface ProductSpec {
  label: string;
  value: string;
  unit?: string;
  group: string;
  displayOrder: number;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  url: string;
  /** "catalog" = the product catalog; "sample" = sample B2B listing (placeholder content). */
  source: "catalog" | "sample";
  shortDescription: string | null;
  description: string | null;
  images: { src: string; remote: boolean; alt: string; primary: boolean }[];
  videos: { src: string; title: string }[];
  documents: { name: string; type: string; url: string }[];
  pricing: { type: "fixed" | "range" | "estimated"; min: number; max?: number; currency: "INR"; unit: string };
  moq: { quantity: number; unit: string } | null;
  /** No availability data exists, so this is always null. */
  availability: null;
  category: { id: string; name: string; href: string };
  subcategory: { id: string; name: string; href: string } | null;
  breadcrumb: BreadcrumbItem[];
  specifications: ProductSpec[];
  technicalDetails: ProductSpec[];
  applications: string[];
  features: string[];
  rating: { value: number; count?: number } | null;
  supplier: {
    id: string;
    name: string;
    slug: string;
    url: string;
    /** False when no supplier page exists for this slug yet, so the page shows the name without a dead link. */
    profileAvailable: boolean;
    productsUrl: string;
    initials: string;
    city: string;
    state: string;
    type: string | null;
    verificationStatus: "verified" | "unverified";
    productCount: number;
  };
}

const MAIN_ID = "apparel-fashion";

function catalogDetail(product: CatalogProduct, seller: CatalogSeller): ProductDetail {
  const card = toProductCard(product);
  const record = getCategoryRecord(MAIN_ID);
  const sub = slugify(product.categoryName);
  const category = { id: MAIN_ID, name: record?.name ?? "Apparel & Fashion", href: `/categories/${MAIN_ID}` };
  const subcategory = { id: sub, name: product.categoryName, href: `/categories/${MAIN_ID}/${sub}` };
  const image = normalizeImage((card.tile as { imageSrc?: string }).imageSrc);

  const specifications: ProductSpec[] = [
    { label: "Category", value: product.categoryName, group: "General", displayOrder: 1 },
    { label: "Department", value: product.department, group: "General", displayOrder: 2 },
    ...(product.colour ? [{ label: "Colour", value: product.colour, group: "General", displayOrder: 3 }] : []),
    ...(product.sizes.length ? [{ label: "Sizes (estimated)", value: product.sizes.join(", "), group: "General", displayOrder: 4 }] : []),
  ];

  return {
    id: String(product.id),
    slug: product.slug,
    name: product.name,
    url: card.href,
    source: "catalog",
    shortDescription: null,
    description: null,
    images: image ? [{ ...image, alt: product.name, primary: true }] : [],
    videos: [],
    documents: [],
    pricing: { type: "estimated", min: product.estimatedPriceInr, currency: "INR", unit: card.priceUnit },
    moq: null,
    availability: null,
    category,
    subcategory,
    breadcrumb: [{ label: "Home", href: "/" }, { label: category.name, href: category.href }, { label: subcategory.name, href: subcategory.href }, { label: product.name }],
    specifications,
    technicalDetails: [],
    applications: [],
    features: [],
    rating: null,
    supplier: {
      id: seller.id,
      name: seller.name,
      slug: seller.slug,
      url: `/suppliers/${seller.slug}`,
      profileAvailable: true,
      productsUrl: `/suppliers/${seller.slug}/products`,
      initials: initials(seller.name),
      city: seller.city,
      state: seller.state,
      type: null,
      // The catalog has no verification data, so no catalog seller is shown as verified.
      verificationStatus: "unverified",
      productCount: seller.productCount + (ADOPTED_SELLERS[seller.slug] === seller.id ? sampleListingCount(seller.slug) : 0),
    },
  };
}

function sampleDetail(product: B2BProduct, pageSlug: string): ProductDetail {
  const page = getCategoryPage(pageSlug)!;
  const mainId = canonicalCategorySlug(page.slug);
  const record = getCategoryRecord(mainId);
  const category = { id: mainId, name: record?.name ?? page.name, href: `/categories/${mainId}` };
  // Sample pages of a catalog-backed main category (the textile samples) have no subcategory page of their own.
  const subLabel = page.subcategories.find((s) => s.id === product.subcategoryId)?.name;
  const subcategory = subLabel && record?.source === "sample" ? { id: product.subcategoryId, name: subLabel, href: `/categories/${mainId}/${product.subcategoryId}` } : null;
  const image = normalizeImage((product.tile as { imageSrc?: string }).imageSrc);
  const slug = product.supplierHref.replace(/^\/suppliers\//, "");

  const specifications: ProductSpec[] = [
    { label: "Category", value: category.name, group: "General", displayOrder: 1 },
    ...(subLabel ? [{ label: "Subcategory", value: subLabel, group: "General", displayOrder: 2 }] : []),
    ...(product.moq !== undefined && product.moqUnit ? [{ label: "Minimum order", value: product.moq.toLocaleString("en-IN"), unit: product.moqUnit, group: "Commercial", displayOrder: 3 }] : []),
  ];

  return {
    id: product.id,
    slug: product.id,
    name: product.name,
    url: product.href,
    source: "sample",
    shortDescription: null,
    description: null,
    images: image ? [{ ...image, alt: product.name, primary: true }] : [],
    videos: [],
    documents: [],
    pricing: { type: product.priceMax && product.priceMax !== product.priceMin ? "range" : "fixed", min: product.priceMin, max: product.priceMax, currency: "INR", unit: product.priceUnit },
    moq: product.moq !== undefined && product.moqUnit ? { quantity: product.moq, unit: product.moqUnit } : null,
    availability: null,
    category,
    subcategory,
    breadcrumb: [
      { label: "Home", href: "/" },
      { label: category.name, href: category.href },
      ...(subcategory ? [{ label: subcategory.name, href: subcategory.href }] : []),
      { label: product.name },
    ],
    specifications,
    technicalDetails: [],
    applications: [],
    features: [],
    rating: product.rating !== undefined ? { value: product.rating, count: product.reviewCount } : null,
    supplier: {
      id: slug,
      name: product.supplierName,
      slug,
      url: product.supplierHref,
      profileAvailable: hasSupplierProfile(slug),
      productsUrl: `/suppliers/${slug}/products`,
      initials: initials(product.supplierName),
      city: product.supplierCity,
      state: product.supplierState,
      type: product.supplierType,
      verificationStatus: product.verified ? "verified" : "unverified",
      productCount: getProductsBySupplier(product.supplierHref).length + (adoptedSeller(slug)?.productCount ?? 0),
    },
  };
}

/** Resolves a product by its URL slug (catalog `<name>-<id>` or a sample listing id). Undefined when it does not exist. */
export function getPublicProductBySlug(slug: string): ProductDetail | undefined {
  const sample = getSampleProduct(slug);
  if (sample) return sampleDetail(sample.product, sample.category.slug);

  const product = getCatalogProductBySlug(slug);
  const seller = product ? getCatalog().sellerById.get(product.sellerId) : undefined;
  return product && seller ? catalogDetail(product, seller) : undefined;
}

/** Resolves by catalog id ("1163") or slug, for the API. */
export function getPublicProductByKey(key: string): ProductDetail | undefined {
  if (/^\d+$/.test(key)) {
    const product = getCatalog().productById.get(Number(key));
    const seller = product ? getCatalog().sellerById.get(product.sellerId) : undefined;
    return product && seller ? catalogDetail(product, seller) : undefined;
  }
  return getPublicProductBySlug(key);
}

/**
 * Related products by transparent category matching, no scoring: same subcategory first, then the same
 * main category (the same department for catalog products). The product itself is never included.
 */
export function getRelatedItems(detail: ProductDetail, limit = 8): ListingItem[] {
  const out: ListingItem[] = [];
  const seen = new Set<string>([detail.id]);

  if (detail.source === "catalog") {
    const { products, sellerById } = getCatalog();
    const current = products.find((p) => String(p.id) === detail.id);
    if (!current) return [];
    const toItem = (p: CatalogProduct): ListingItem | undefined => {
      const seller = sellerById.get(p.sellerId);
      if (!seller) return undefined;
      return {
        card: toProductCard(p),
        meta: {
          source: "catalog",
          category: { id: MAIN_ID, name: detail.category.name },
          subcategory: { id: slugify(p.categoryName), name: p.categoryName },
          department: p.department,
          colour: p.colour || undefined,
          supplierKey: seller.id,
          supplierSlug: seller.slug,
          verified: false,
        },
      };
    };
    for (const pass of [(p: CatalogProduct) => p.categoryName === current.categoryName, (p: CatalogProduct) => p.department === current.department]) {
      for (const p of products) {
        if (out.length >= limit) return out;
        if (seen.has(String(p.id)) || !pass(p)) continue;
        const item = toItem(p);
        if (!item) continue;
        seen.add(String(p.id));
        out.push(item);
      }
    }
    return out;
  }

  const sample = getSampleProduct(detail.id);
  if (!sample) return [];
  const toItem = (p: B2BProduct): ListingItem => ({
    card: p,
    meta: {
      source: "sample",
      category: { id: detail.category.id, name: detail.category.name },
      subcategory: { id: p.subcategoryId, name: sample.category.subcategories.find((s) => s.id === p.subcategoryId)?.name ?? p.subcategoryId },
      supplierKey: p.supplierHref.replace(/^\/suppliers\//, ""),
      supplierSlug: p.supplierHref.replace(/^\/suppliers\//, ""),
      supplierType: p.supplierType,
      verified: p.verified,
    },
  });
  for (const pass of [(p: B2BProduct) => p.subcategoryId === sample.product.subcategoryId, () => true]) {
    for (const p of sample.category.products) {
      if (out.length >= limit) return out;
      if (seen.has(p.id) || !pass(p)) continue;
      seen.add(p.id);
      out.push(toItem(p));
    }
  }
  return out;
}
