import type { LucideIcon } from "lucide-react";

export interface NavCategory {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

/**
 * Visual tiles (category/industry/supplier cards) render from an icon + tint
 * until licensed photography is available — see docs/MISSING_ASSETS.md.
 * `imageSrc`, once supplied, takes priority over the icon fallback.
 */
export interface MediaTile {
  icon: LucideIcon;
  tint: "blue" | "navy" | "slate";
  imageSrc?: string;
}

/**
 * Serializable twin of MediaTile for data that crosses a Server->Client
 * Component boundary (e.g. product cards inside the client-side filter/sort
 * grid). A LucideIcon is a function and cannot be passed as a prop into a
 * "use client" component, so client-crossing tiles reference the icon by
 * name and resolve it from ICON_REGISTRY (src/lib/constants/icons.ts).
 */
export interface SerializableTile {
  iconName: string;
  tint: "blue" | "navy" | "slate";
  imageSrc?: string;
}

export interface TopCategory extends MediaTile {
  id: string;
  name: string;
  href: string;
}

export interface Supplier {
  id: string;
  name: string;
  city: string;
  state: string;
  categoryLabel: string;
  verified: boolean;
  rating?: number;
  reviewCount?: number;
  href: string;
  tile: MediaTile;
}

/**
 * Full supplier profile page data (`/suppliers/[slug]`). Extends the
 * lightweight homepage `Supplier` card with the fields that page needs.
 * Fields are optional where real data may not exist yet — the page must
 * hide a section rather than fabricate a value. See docs/MISSING_ASSETS.md.
 */
export interface SupplierProfile extends Supplier {
  businessType?: SupplierType;
  headline?: string;
  description: string;
  mainCategories: string[];
  supplyType?: string[];
  memberSince?: string;
  /** Initials shown as a neutral logo placeholder when no genuine logo exists. */
  logoText?: string;
  heroImageSrc?: string;
  galleryImages?: { src: string; alt: string }[];
}

/**
 * Catalog records loaded from the seed CSVs in db/seed (see src/lib/catalog).
 * Only active sellers are loaded. Seller contact details are deliberately not
 * loaded at all — the source values are placeholders.
 */
export interface CatalogSeller {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  specialization: string;
  rating: number;
  joinedDate: string;
  productCount: number;
}

export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  colour: string;
  categoryName: string;
  department: string;
  productType: string;
  /** Estimated by product type in the source data, not a real seller price. */
  estimatedPriceInr: number;
  /** Estimated by product type in the source data. */
  sizes: string[];
  imageUrl: string;
  sellerId: string;
}

export interface IndustrySolution extends MediaTile {
  id: string;
  name: string;
  href: string;
}

export interface Testimonial {
  id: string;
  name: string;
  businessName: string;
  quote: string;
  rating?: number;
  /** Photo of the customer, only with their permission. Initials-free generic avatar is shown when absent. */
  avatarSrc?: string;
}

export interface ProcessStep {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface TrustStat {
  label: string;
  value: string;
  icon: LucideIcon;
}

export type SupplierType =
  | "Manufacturer"
  | "Wholesaler"
  | "Exporter"
  | "Trader"
  | "Retailer";

export interface Subcategory extends MediaTile {
  id: string;
  name: string;
  href: string;
  productCount?: number;
}

export interface B2BProduct {
  id: string;
  name: string;
  href: string;
  subcategoryId: string;
  priceMin: number;
  priceMax?: number;
  priceUnit: string;
  moq: number;
  moqUnit: string;
  supplierName: string;
  supplierHref: string;
  supplierCity: string;
  supplierState: string;
  supplierType: SupplierType;
  verified: boolean;
  rating?: number;
  reviewCount?: number;
  badge?: "Best Seller" | "Popular";
  tile: SerializableTile;
}

/**
 * What a product card needs. B2BProduct satisfies it, and so do products
 * mapped from the catalog database, which have no MOQ, rating or verification.
 */
export interface ProductCardData {
  id: string;
  name: string;
  href: string;
  tile: SerializableTile;
  priceMin: number;
  priceMax?: number;
  priceUnit: string;
  priceIsEstimated?: boolean;
  moq?: number;
  moqUnit?: string;
  supplierName: string;
  supplierHref: string;
  supplierCity: string;
  supplierState: string;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  badge?: "Best Seller" | "Popular";
}

export interface ProductDetailData extends ProductCardData {
  supplierType?: SupplierType;
  colour?: string;
  sizes?: string[];
  categoryLabel?: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface CategoryPageData {
  slug: string;
  name: string;
  parentLabel: string;
  parentHref: string;
  description: string;
  heroVisual: MediaTile;
  stats: TrustStat[];
  subcategories: Subcategory[];
  products: B2BProduct[];
}

export type SortOption = "relevance" | "price-asc" | "price-desc" | "newest";

export type ViewMode = "grid" | "list";

export interface ProductFilterState {
  subcategoryIds: string[];
  priceMin: number | null;
  priceMax: number | null;
  supplierTypes: SupplierType[];
  cities: string[];
  minRating: number | null;
  verifiedOnly: boolean;
}

/** One discoverable category on /categories. Serializable, so it can be passed to Client Components. */
export interface CategoryNode {
  /** Slug path: "apparel-fashion" > "apparel-fashion/men" > "apparel-fashion/men/men-tshirts". */
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  childIds: string[];
  /** Eligible active products behind this category; matches what its listing page shows. */
  productCount: number;
  /** Listing page this category opens. */
  href: string;
  isActive: boolean;
  imageSrc?: string;
  /** True for hot-linked product photos, which next/image must not optimise. */
  imageRemote?: boolean;
  imageAlt: string;
  /** Lucide icon key for the sidebar (main categories only). */
  iconKey?: string;
  /** "Curated" = the homepage top categories; "catalog" = derived from the product catalog. */
  source: "curated" | "catalog";
}

export interface CategoryDirectory {
  nodes: CategoryNode[];
  totals: { mainCategories: number; subcategories: number; products: number };
}
