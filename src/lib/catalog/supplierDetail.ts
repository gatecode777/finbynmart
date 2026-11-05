import { getProductsBySupplier } from "@/lib/constants/categoryPages";
import { getSupplierProfile } from "@/lib/constants/supplierProfiles";
import { FEATURED_SUPPLIERS } from "@/lib/constants/suppliers";
import type { ProductCardData } from "@/types";
import { getCatalog, adoptedSeller } from "./data";
import { toProductCard } from "./mappers";
import { normalizeImage } from "./publicProduct";
import { initials } from "./slug";

/**
 * Server-only. The public supplier profile: one DTO for every kind of supplier the site shows.
 *  - catalog sellers (1,062 fictional sample sellers with a real product list),
 *  - the sample suppliers behind the homepage cards and the sample B2B listings (placeholder content, see
 *    docs/MISSING_ASSETS.md); one of them, Shree Textiles, has a hand-written sample profile.
 * Only fields a record holds are filled. There is no company description, logo, banner, video, business type,
 * years in business, turnover, GST, employee range, website, certification, review or response-rate data anywhere,
 * so those are absent and the page says so or leaves them out. Contact details are never loaded.
 */
export interface SupplierDetail {
  id: string;
  slug: string;
  name: string;
  initials: string;
  url: string;
  /** "catalog" = a catalog seller; "sample" = a sample supplier (placeholder content). */
  source: "catalog" | "sample";
  industry: string | null;
  /** The supplier's own most common product categories (at most 3). */
  categories: string[];
  /** How many distinct categories the supplier's products belong to (not limited to 3). */
  categoryCount: number;
  city: string;
  state: string;
  supplierType: string | null;
  /** "verified" only where a record says so; there is no verification workflow. */
  verificationStatus: "verified" | "unverified";
  /** Platform membership year (not years in business). */
  memberSince: string | null;
  /** Written by the supplier; null when they have not added one. */
  description: string | null;
  /** Real photos of the supplier's own products (never a stock picture presented as the company). */
  images: { src: string; alt: string; remote: boolean }[];
  /** A first page of the supplier's products as cards. */
  products: ProductCardData[];
  productCount: number;
  productsUrl: string;
}

const slugOf = (href: string) => href.replace(/^\/suppliers\//, "");

function sampleSupplier(slug: string): SupplierDetail | undefined {
  const listings = getProductsBySupplier(`/suppliers/${slug}`);
  const profile = getSupplierProfile(slug);
  const featured = FEATURED_SUPPLIERS.find((s) => s.id === slug);
  if (!profile && !featured && listings.length === 0) return undefined;

  const base = profile ?? featured;
  const first = listings[0];
  const types = [...new Set(listings.map((l) => l.supplierType))];
  const name = base?.name ?? first.supplierName;
  const images = listings
    .map((l) => ({ raw: (l.tile as { imageSrc?: string }).imageSrc, name: l.name }))
    .map((l) => ({ image: normalizeImage(l.raw), name: l.name }))
    .filter((l): l is { image: { src: string; remote: boolean }; name: string } => Boolean(l.image))
    .slice(0, 3)
    .map((l) => ({ ...l.image, alt: `${l.name} from ${name}` }));

  // A sample supplier that is also a seed seller shows the seller's photographed products first.
  const adopted = adoptedSeller(slug);
  const catalogProducts = adopted ? (getCatalog().productsBySeller.get(adopted.id) ?? []) : [];
  const catalogImages: SupplierDetail["images"] = [];
  const seenCategories = new Set<string>();
  for (const p of catalogProducts) {
    if (catalogImages.length >= 3) break;
    if (seenCategories.has(p.categoryName)) continue;
    const image = normalizeImage(p.imageUrl);
    if (!image) continue;
    seenCategories.add(p.categoryName);
    catalogImages.push({ ...image, alt: `${p.name} from ${name}` });
  }

  return {
    id: slug,
    slug,
    name,
    initials: initials(name),
    url: `/suppliers/${slug}`,
    source: "sample",
    industry: base?.categoryLabel ?? null,
    categories: [...new Set([...catalogProducts.map((p) => p.categoryName), ...listings.map((l) => l.name)])].slice(0, 3),
    categoryCount: new Set([...catalogProducts.map((p) => p.categoryName), ...listings.map((l) => l.name)]).size,
    city: base?.city ?? first.supplierCity,
    state: base?.state ?? first.supplierState,
    supplierType: profile?.businessType ?? (types.length === 1 ? types[0] : null),
    verificationStatus: (base?.verified ?? listings.some((l) => l.verified)) ? "verified" : "unverified",
    memberSince: profile?.memberSince ?? null,
    description: profile?.description ?? null,
    images: catalogImages.length > 0 ? catalogImages : images,
    products: [...catalogProducts.map(toProductCard), ...listings].slice(0, 8),
    productCount: listings.length + catalogProducts.length,
    productsUrl: `/suppliers/${slug}/products`,
  };
}

function catalogSupplier(slug: string): SupplierDetail | undefined {
  const { sellerBySlug, productsBySeller } = getCatalog();
  const seller = sellerBySlug.get(slug);
  if (!seller) return undefined;
  const products = productsBySeller.get(seller.id) ?? [];

  const perCategory = new Map<string, number>();
  for (const p of products) perCategory.set(p.categoryName, (perCategory.get(p.categoryName) ?? 0) + 1);
  const categories = [...perCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);

  // One photo from each of the supplier's first few distinct categories, so the strip shows range, not repeats.
  const seen = new Set<string>();
  const images: SupplierDetail["images"] = [];
  for (const p of products) {
    if (images.length >= 3) break;
    if (seen.has(p.categoryName)) continue;
    const image = normalizeImage(p.imageUrl);
    if (!image) continue;
    seen.add(p.categoryName);
    images.push({ ...image, alt: `${p.name} from ${seller.name}` });
  }

  return {
    id: seller.id,
    slug: seller.slug,
    name: seller.name,
    initials: initials(seller.name),
    url: `/suppliers/${seller.slug}`,
    source: "catalog",
    industry: seller.specialization,
    categories: categories.slice(0, 3),
    categoryCount: categories.length,
    city: seller.city,
    state: seller.state,
    supplierType: null,
    verificationStatus: "unverified",
    memberSince: seller.joinedDate.slice(0, 4),
    description: null,
    images,
    products: products.slice(0, 8).map(toProductCard),
    productCount: products.length,
    productsUrl: `/suppliers/${seller.slug}/products`,
  };
}

/** The public profile for a supplier slug, or undefined when there is none. */
export function getPublicSupplierBySlug(slug: string): SupplierDetail | undefined {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return undefined;
  return sampleSupplier(slug) ?? catalogSupplier(slug);
}

/** True when /suppliers/<slug> would show a profile (cheap: no product cards are built). */
export function hasSupplierProfile(slug: string): boolean {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return false;
  return (
    Boolean(getSupplierProfile(slug)) ||
    FEATURED_SUPPLIERS.some((s) => s.id === slug) ||
    getProductsBySupplier(`/suppliers/${slug}`).length > 0 ||
    getCatalog().sellerBySlug.has(slug)
  );
}

export { slugOf as supplierSlugFromHref };
