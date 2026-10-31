import { Shirt } from "lucide-react";
import type { CatalogProduct, CatalogSeller, ProductCardData, ProductDetailData, SupplierProfile } from "@/types";
import { getCatalog } from "./data";
import { getSellerTopCategories } from "./queries";
import { initials } from "./slug";

export function sellerHref(seller: CatalogSeller): string {
  return `/suppliers/${seller.slug}`;
}

export function productHref(product: CatalogProduct): string {
  return `/products/${product.slug}`;
}

function sellerOf(product: CatalogProduct): CatalogSeller {
  const seller = getCatalog().sellerById.get(product.sellerId);
  if (!seller) throw new Error(`Product ${product.id} references unknown seller ${product.sellerId}`);
  return seller;
}

export function toProductCard(product: CatalogProduct): ProductCardData {
  const seller = sellerOf(product);
  return {
    id: String(product.id),
    name: product.name,
    href: productHref(product),
    // Photo is loaded straight from the dataset's host by the visitor's browser.
    tile: { iconName: "Shirt", tint: "slate", imageSrc: product.imageUrl },
    priceMin: product.estimatedPriceInr,
    priceUnit: "Piece",
    priceIsEstimated: true,
    supplierName: seller.name,
    supplierHref: sellerHref(seller),
    supplierCity: seller.city,
    supplierState: seller.state,
  };
}

export function toProductDetail(product: CatalogProduct): ProductDetailData {
  return {
    ...toProductCard(product),
    colour: product.colour,
    sizes: product.sizes,
    categoryLabel: product.categoryName,
  };
}

/** Builds the supplier-profile page model from real catalog facts only. */
export function sellerToSupplierProfile(seller: CatalogSeller): SupplierProfile {
  const specialization = seller.specialization === "Multi-category" ? "Apparel" : seller.specialization;
  return {
    id: seller.id,
    name: seller.name,
    city: seller.city,
    state: seller.state,
    categoryLabel: seller.specialization,
    // The catalog has no verification data, so no seller is shown as verified.
    verified: false,
    rating: seller.rating,
    href: sellerHref(seller),
    tile: { icon: Shirt, tint: "slate" },
    headline: `Quality ${specialization} for a Better Tomorrow`,
    description: `${seller.name} is a ${seller.specialization} seller based in ${seller.city}, ${seller.state}, with ${seller.productCount} products listed on Finbyn Mart.`,
    mainCategories: getSellerTopCategories(seller.id),
    memberSince: seller.joinedDate.slice(0, 4),
    logoText: initials(seller.name),
    // Generic apparel category photo, not this seller's own premises.
    heroImageSrc: "/images/categories/apparel-fashion.png",
    galleryImages: [],
  };
}
