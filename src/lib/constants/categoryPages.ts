import {
  Package,
  ShoppingBag,
  Archive,
  Boxes,
  Tag,
  FileText,
  TreePine,
  Layers3,
  Users,
  Truck,
} from "lucide-react";
import type { B2BProduct, CategoryPageData, Subcategory } from "@/types";

/**
 * Sample category-page datasets for visual development only. There is no
 * confirmed backend for category/product/supplier data yet — see
 * docs/MISSING_ASSETS.md. Unlike the reference mockup, counts here are
 * computed from this real (small) sample array rather than copying the
 * mockup's illustrative five/six-figure numbers, so nothing on the page
 * claims a scale we can't back up.
 */

const packagingMaterialSubcategories: Subcategory[] = [
  { id: "corrugated-boxes", name: "Corrugated Boxes", href: "/category/corrugated-boxes", icon: Archive, tint: "navy" },
  { id: "packaging-bags", name: "Packaging Bags", href: "/category/packaging-bags", icon: ShoppingBag, tint: "blue" },
  { id: "plastic-containers", name: "Plastic Containers", href: "/category/plastic-containers", icon: Package, tint: "slate" },
  { id: "bubble-wrap", name: "Bubble Wrap", href: "/category/bubble-wrap", icon: Layers3, tint: "blue" },
  { id: "tape-adhesives", name: "Tape & Adhesives", href: "/category/tape-adhesives", icon: Tag, tint: "navy" },
  { id: "paper-packaging", name: "Paper Packaging", href: "/category/paper-packaging", icon: FileText, tint: "slate" },
  { id: "wooden-packaging", name: "Wooden Packaging", href: "/category/wooden-packaging", icon: TreePine, tint: "blue" },
  { id: "thermocol-products", name: "Thermocol Products", href: "/category/thermocol-products", icon: Boxes, tint: "navy" },
];

const packagingMaterialProducts: B2BProduct[] = [
  {
    id: "corrugated-packaging-boxes",
    name: "Corrugated Packaging Boxes",
    href: "/products/corrugated-packaging-boxes",
    subcategoryId: "corrugated-boxes",
    priceMin: 12,
    priceMax: 25,
    priceUnit: "Piece",
    moq: 500,
    moqUnit: "Pieces",
    supplierName: "Shree Packaging Solutions",
    supplierHref: "/suppliers/shree-packaging-solutions",
    supplierCity: "Surat",
    supplierState: "Gujarat",
    supplierType: "Manufacturer",
    verified: true,
    rating: 4.5,
    reviewCount: 230,
    badge: "Best Seller",
    tile: { icon: Archive, tint: "navy" },
  },
  {
    id: "stretch-film-roll",
    name: "Stretch Film Roll",
    href: "/products/stretch-film-roll",
    subcategoryId: "bubble-wrap",
    priceMin: 180,
    priceMax: 320,
    priceUnit: "Roll",
    moq: 100,
    moqUnit: "Rolls",
    supplierName: "PackPro Industries",
    supplierHref: "/suppliers/packpro-industries",
    supplierCity: "Delhi",
    supplierState: "Delhi",
    supplierType: "Manufacturer",
    verified: true,
    rating: 4.3,
    reviewCount: 118,
    tile: { icon: Layers3, tint: "blue" },
  },
  {
    id: "bopp-packaging-tape",
    name: "BOPP Packaging Tape",
    href: "/products/bopp-packaging-tape",
    subcategoryId: "tape-adhesives",
    priceMin: 45,
    priceMax: 80,
    priceUnit: "Piece",
    moq: 1000,
    moqUnit: "Pieces",
    supplierName: "Global Adhesives",
    supplierHref: "/suppliers/global-adhesives",
    supplierCity: "Mumbai",
    supplierState: "Maharashtra",
    supplierType: "Manufacturer",
    verified: true,
    rating: 4.6,
    reviewCount: 320,
    badge: "Popular",
    tile: { icon: Tag, tint: "slate" },
  },
  {
    id: "bubble-wrap-roll",
    name: "Bubble Wrap Roll",
    href: "/products/bubble-wrap-roll",
    subcategoryId: "bubble-wrap",
    priceMin: 220,
    priceMax: 450,
    priceUnit: "Roll",
    moq: 50,
    moqUnit: "Rolls",
    supplierName: "SafePack Industries",
    supplierHref: "/suppliers/safepack-industries",
    supplierCity: "Ahmedabad",
    supplierState: "Gujarat",
    supplierType: "Wholesaler",
    verified: true,
    rating: 4.4,
    reviewCount: 190,
    tile: { icon: Layers3, tint: "navy" },
  },
  {
    id: "packaging-pouches",
    name: "Packaging Pouches",
    href: "/products/packaging-pouches",
    subcategoryId: "packaging-bags",
    priceMin: 0.5,
    priceMax: 2.5,
    priceUnit: "Piece",
    moq: 5000,
    moqUnit: "Pieces",
    supplierName: "FlexiPack Solutions",
    supplierHref: "/suppliers/flexipack-solutions",
    supplierCity: "Bengaluru",
    supplierState: "Karnataka",
    supplierType: "Manufacturer",
    verified: true,
    rating: 4.2,
    reviewCount: 145,
    tile: { icon: ShoppingBag, tint: "blue" },
  },
  {
    id: "plastic-storage-containers",
    name: "Plastic Storage Containers",
    href: "/products/plastic-storage-containers",
    subcategoryId: "plastic-containers",
    priceMin: 35,
    priceMax: 120,
    priceUnit: "Piece",
    moq: 500,
    moqUnit: "Pieces",
    supplierName: "PlastoWorld",
    supplierHref: "/suppliers/plastoworld",
    supplierCity: "Chennai",
    supplierState: "Tamil Nadu",
    supplierType: "Wholesaler",
    verified: true,
    rating: 4.3,
    reviewCount: 210,
    tile: { icon: Package, tint: "slate" },
  },
  {
    id: "paper-bags-with-handle",
    name: "Paper Bags with Handle",
    href: "/products/paper-bags-with-handle",
    subcategoryId: "paper-packaging",
    priceMin: 8,
    priceMax: 18,
    priceUnit: "Piece",
    moq: 1000,
    moqUnit: "Pieces",
    supplierName: "EcoPack Paper Products",
    supplierHref: "/suppliers/ecopack-paper-products",
    supplierCity: "Kolkata",
    supplierState: "West Bengal",
    supplierType: "Manufacturer",
    verified: true,
    rating: 4.5,
    reviewCount: 198,
    tile: { icon: FileText, tint: "navy" },
  },
  {
    id: "wooden-packaging-crates",
    name: "Wooden Packaging Crates",
    href: "/products/wooden-packaging-crates",
    subcategoryId: "wooden-packaging",
    priceMin: 350,
    priceMax: 850,
    priceUnit: "Piece",
    moq: 50,
    moqUnit: "Pieces",
    supplierName: "WoodPack Industries",
    supplierHref: "/suppliers/woodpack-industries",
    supplierCity: "Pune",
    supplierState: "Maharashtra",
    supplierType: "Exporter",
    verified: true,
    rating: 4.4,
    reviewCount: 176,
    tile: { icon: TreePine, tint: "blue" },
  },
];

function buildCategoryStats(products: B2BProduct[]): CategoryPageData["stats"] {
  const uniqueSuppliers = new Set(products.map((product) => product.supplierName));

  return [
    { label: "Verified Suppliers", value: `${uniqueSuppliers.size}`, icon: Users },
    { label: "Product Listings", value: `${products.length}`, icon: Boxes },
    { label: "Best Price", value: "Direct from Manufacturers", icon: Tag },
    { label: "All India Delivery", value: "Trusted Supplier Network", icon: Truck },
  ];
}

export const CATEGORY_PAGES: Record<string, CategoryPageData> = {
  "packaging-material": {
    slug: "packaging-material",
    name: "Packaging Material",
    parentLabel: "Industrial Supplies",
    parentHref: "/categories/industrial-supplies",
    description:
      "Find verified suppliers of packaging material, boxes, bags, containers and more. Get best prices, compare quotes and connect with manufacturers.",
    stats: buildCategoryStats(packagingMaterialProducts),
    subcategories: packagingMaterialSubcategories,
    products: packagingMaterialProducts,
  },
};

export function getCategoryPage(slug: string): CategoryPageData | undefined {
  return CATEGORY_PAGES[slug];
}

export const SUPPLIER_TYPE_OPTIONS = [
  "Manufacturer",
  "Wholesaler",
  "Exporter",
  "Trader",
  "Retailer",
] as const;

export const RATING_OPTIONS = [4, 3, 2, 1] as const;
