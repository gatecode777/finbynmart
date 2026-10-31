import type { B2BProduct, ProductFilterState, SortOption } from "@/types";

export function defaultFilterState(): ProductFilterState {
  return {
    subcategoryIds: [],
    priceMin: null,
    priceMax: null,
    supplierTypes: [],
    cities: [],
    minRating: null,
    verifiedOnly: false,
  };
}

export function isFilterActive(filters: ProductFilterState): boolean {
  return (
    filters.subcategoryIds.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.supplierTypes.length > 0 ||
    filters.cities.length > 0 ||
    filters.minRating !== null ||
    filters.verifiedOnly
  );
}

export function applyFilters(
  products: B2BProduct[],
  filters: ProductFilterState
): B2BProduct[] {
  return products.filter((product) => {
    if (
      filters.subcategoryIds.length > 0 &&
      !filters.subcategoryIds.includes(product.subcategoryId)
    ) {
      return false;
    }

    const effectiveMax = product.priceMax ?? product.priceMin;
    if (filters.priceMin !== null && effectiveMax < filters.priceMin) {
      return false;
    }
    if (filters.priceMax !== null && product.priceMin > filters.priceMax) {
      return false;
    }

    if (
      filters.supplierTypes.length > 0 &&
      !filters.supplierTypes.includes(product.supplierType)
    ) {
      return false;
    }

    if (filters.cities.length > 0 && !filters.cities.includes(product.supplierCity)) {
      return false;
    }

    if (filters.minRating !== null && (product.rating ?? 0) < filters.minRating) {
      return false;
    }

    if (filters.verifiedOnly && !product.verified) {
      return false;
    }

    return true;
  });
}

export function sortProducts(
  products: B2BProduct[],
  sort: SortOption
): B2BProduct[] {
  const sorted = [...products];

  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.priceMin - b.priceMin);
    case "price-desc":
      return sorted.sort((a, b) => b.priceMin - a.priceMin);
    case "newest":
      return sorted.reverse();
    case "relevance":
    default:
      return sorted;
  }
}
