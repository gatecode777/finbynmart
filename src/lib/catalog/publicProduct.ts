import type { CategoryListing, ListingItem } from "./categoryListing";
import { unitKey } from "./listingQuery";

/**
 * The public shape of a product in API responses. Built only from approved public fields: no seller
 * contact details, no internal keys, no database ids. `source` tells a consumer whether the record comes
 * from the product catalog or from the sample B2B listings (flagged as sample data in docs/MISSING_ASSETS.md).
 */
export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  url: string;
  image: { src: string; remote: boolean } | null;
  price: { min: number; max?: number; currency: "INR"; unit: string; estimated: boolean };
  moq?: { quantity: number; unit: string };
  category: { id: string; name: string };
  subcategory: { id: string; name: string };
  department?: string;
  colour?: string;
  supplier: {
    id: string;
    name: string;
    slug: string;
    url: string;
    city: string;
    state: string;
    type?: string;
    /** "verified" only where the record says so; there is no verification workflow yet. */
    verificationStatus: "verified" | "unverified";
  };
  rating?: { value: number; count?: number };
  source: "catalog" | "sample";
}

/** Hosts a remote product image may come from. Anything else is treated as a missing image. */
const IMAGE_HOSTS = new Set(["assets.myntassets.com", "www.finbynkart.com"]);

/**
 * Normalises the image formats the project holds (a single string, an array, an object with a url) into
 * one public shape, or null. Local paths must be site-relative (/images/...); remote URLs must be https
 * from an allowed host. Never invents a URL and never substitutes another product's picture.
 */
export function normalizeImage(value: unknown): { src: string; remote: boolean } | null {
  if (typeof value === "string") {
    const src = value.trim();
    if (/^\/(?!\/)[\w./%-]+$/.test(src) && !src.includes("..")) return { src, remote: false };
    try {
      const url = new URL(src);
      if (url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname)) return { src: url.toString(), remote: true };
    } catch {
      /* not a URL */
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = normalizeImage(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizeImage(record.url ?? record.src ?? record.imageSrc ?? record.images);
  }
  return null;
}

export function toPublicProduct({ card, meta }: ListingItem): PublicProduct {
  const tile = card.tile as { imageSrc?: string };
  const slug = card.href.replace(/^\/products\//, "");
  return {
    id: card.id,
    slug,
    name: card.name,
    url: card.href,
    image: normalizeImage(tile.imageSrc),
    price: { min: card.priceMin, max: card.priceMax, currency: "INR", unit: card.priceUnit, estimated: Boolean(card.priceIsEstimated) },
    moq: card.moq !== undefined && card.moqUnit ? { quantity: card.moq, unit: unitKey(card.moqUnit) } : undefined,
    category: meta.category,
    subcategory: meta.subcategory,
    department: meta.department,
    colour: meta.colour,
    supplier: {
      id: meta.supplierKey,
      name: card.supplierName,
      slug: meta.supplierSlug,
      url: card.supplierHref,
      city: card.supplierCity,
      state: card.supplierState,
      type: meta.supplierType,
      verificationStatus: meta.verified ? "verified" : "unverified",
    },
    // Ratings exist only on the sample listings; they are returned as-is and marked by `source`.
    rating: card.rating !== undefined ? { value: card.rating, count: card.reviewCount } : undefined,
    source: meta.source,
  };
}

export function toPublicFacets(listing: CategoryListing) {
  const f = listing.facets;
  return {
    categories: f.categories,
    subcategories: f.subcategories,
    supplierTypes: f.supplierTypes ?? [],
    moq: f.moq ?? [],
    states: f.locations,
    cities: f.cities,
    colours: f.colours ?? [],
    price: f.price ? { currency: "INR", min: f.price.min, max: f.price.max } : null,
  };
}

/**
 * Related searches from real data: the subcategories of the products the search matched, most products first,
 * minus the one the buyer already searched for. Each one is guaranteed to have results because its name is part
 * of the searched text of those products. Hidden (empty) when there is nothing reliable to offer.
 */
export function getRelatedSearches(query: string, search: { subcategories: { label: string }[] } | undefined, limit = 6): string[] {
  if (!search) return [];
  const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: string[] = [];
  for (const { label } of search.subcategories) {
    if (same(label, query) || out.some((existing) => same(existing, label))) continue;
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}
