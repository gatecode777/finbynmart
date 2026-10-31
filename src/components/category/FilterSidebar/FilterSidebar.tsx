"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SUPPLIER_TYPE_OPTIONS, RATING_OPTIONS } from "@/lib/constants/categoryPages";
import { isFilterActive } from "@/lib/utils/productFilters";
import type { B2BProduct, ProductFilterState, SupplierType } from "@/types";
import styles from "./FilterSidebar.module.css";

interface FilterSidebarProps {
  subcategories: { id: string; name: string }[];
  products: B2BProduct[];
  filters: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  onClearAll: () => void;
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function countBy(products: B2BProduct[], predicate: (product: B2BProduct) => boolean): number {
  return products.filter(predicate).length;
}

export function FilterSidebar({
  subcategories,
  products,
  filters,
  onChange,
  onClearAll,
}: FilterSidebarProps) {
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [priceMinInput, setPriceMinInput] = useState(filters.priceMin?.toString() ?? "");
  const [priceMaxInput, setPriceMaxInput] = useState(filters.priceMax?.toString() ?? "");

  const cities = useMemo(
    () => Array.from(new Set(products.map((product) => product.supplierCity))).sort(),
    [products]
  );

  const visibleSubcategories = subcategories.filter((subcategory) =>
    subcategory.name.toLowerCase().includes(subcategorySearch.toLowerCase())
  );

  const visibleCities = cities.filter((city) =>
    city.toLowerCase().includes(citySearch.toLowerCase())
  );

  function applyPriceRange() {
    const min = priceMinInput.trim() === "" ? null : Number(priceMinInput);
    const max = priceMaxInput.trim() === "" ? null : Number(priceMaxInput);
    onChange({
      ...filters,
      priceMin: Number.isFinite(min) ? min : null,
      priceMax: Number.isFinite(max) ? max : null,
    });
  }

  return (
    <aside className={styles.sidebar} aria-label="Filters">
      <div className={styles.headerRow}>
        <span className={styles.heading}>Filters</span>
        <button
          type="button"
          className={styles.clearAll}
          onClick={onClearAll}
          disabled={!isFilterActive(filters)}
        >
          Clear All
        </button>
      </div>

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Categories
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <input
            type="text"
            placeholder="Search subcategories..."
            className={styles.searchInput}
            value={subcategorySearch}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSubcategorySearch(event.target.value)}
          />
          <div className={styles.optionList}>
            {visibleSubcategories.map((subcategory) => {
              const count = countBy(products, (p) => p.subcategoryId === subcategory.id);
              return (
                <label key={subcategory.id} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={filters.subcategoryIds.includes(subcategory.id)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        subcategoryIds: toggleValue(filters.subcategoryIds, subcategory.id),
                      })
                    }
                  />
                  {subcategory.name}
                  <span className={styles.optionCount}>({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>

      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          Price Range (₹)
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <div className={styles.priceRow}>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Min"
              className={styles.priceInput}
              value={priceMinInput}
              onChange={(event) => setPriceMinInput(event.target.value)}
            />
            <span>to</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Max"
              className={styles.priceInput}
              value={priceMaxInput}
              onChange={(event) => setPriceMaxInput(event.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" className={styles.priceApply} onClick={applyPriceRange}>
            Apply
          </Button>
        </div>
      </details>

      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          Supplier Type
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <div className={styles.optionList}>
            {SUPPLIER_TYPE_OPTIONS.map((type: SupplierType) => {
              const count = countBy(products, (p) => p.supplierType === type);
              if (count === 0) return null;
              return (
                <label key={type} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={filters.supplierTypes.includes(type)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        supplierTypes: toggleValue(filters.supplierTypes, type),
                      })
                    }
                  />
                  {type}
                  <span className={styles.optionCount}>({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>

      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          Location
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <input
            type="text"
            placeholder="Search city..."
            className={styles.searchInput}
            value={citySearch}
            onChange={(event) => setCitySearch(event.target.value)}
          />
          <div className={styles.optionList}>
            {visibleCities.map((city) => {
              const count = countBy(products, (p) => p.supplierCity === city);
              return (
                <label key={city} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={filters.cities.includes(city)}
                    onChange={() =>
                      onChange({ ...filters, cities: toggleValue(filters.cities, city) })
                    }
                  />
                  {city}
                  <span className={styles.optionCount}>({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>

      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          Ratings
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <div className={styles.optionList}>
            {RATING_OPTIONS.map((rating) => {
              const count = countBy(products, (p) => (p.rating ?? 0) >= rating);
              return (
                <label key={rating} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={filters.minRating === rating}
                    onChange={() =>
                      onChange({
                        ...filters,
                        minRating: filters.minRating === rating ? null : rating,
                      })
                    }
                  />
                  {rating.toFixed(1)} &amp; above
                  <span className={styles.optionCount}>({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>

      <details className={styles.group}>
        <summary className={styles.groupSummary}>
          Business Verification
          <ChevronDown size={16} className={styles.chevron} aria-hidden />
        </summary>
        <div className={styles.groupBody}>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={filters.verifiedOnly}
              onChange={() => onChange({ ...filters, verifiedOnly: !filters.verifiedOnly })}
            />
            <ShieldCheck size={14} aria-hidden />
            Verified Suppliers Only
            <span className={styles.optionCount}>
              ({countBy(products, (p) => p.verified)})
            </span>
          </label>
        </div>
      </details>
    </aside>
  );
}
