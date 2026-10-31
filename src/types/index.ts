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
  tile: MediaTile;
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
  stats: TrustStat[];
  subcategories: Subcategory[];
  products: B2BProduct[];
}
