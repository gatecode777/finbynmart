import Form from "next/form";
import Link from "next/link";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterCheckList } from "./FilterCheckList";
import { NO_FILTERS, listingHref, type FacetOption, type ListingQuery } from "@/lib/catalog/listingQuery";
import styles from "./CategoryFilters.module.css";

interface CategoryFiltersProps {
  /** Path the form submits to, e.g. /categories/<slug> or /categories/<slug>/<sub>. */
  basePath: string;
  query: ListingQuery;
  facets: {
    categories?: FacetOption[];
    subcategories: FacetOption[];
    supplierTypes: FacetOption[] | null;
    moq: FacetOption[] | null;
    locations: FacetOption[];
    cities?: FacetOption[];
    colours: FacetOption[] | null;
    price: { min: number; max: number } | null;
  };
  activeFilters: number;
  /** "global" (All Products) opens only Category and Price by default, as in the reference. */
  variant?: "category" | "global";
}

function Group({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className={styles.group} open={open}>
      <summary className={styles.summary}>
        {title}
        <ChevronDown size={16} className={styles.chevron} aria-hidden />
      </summary>
      <div className={styles.groupBody}>{children}</div>
    </details>
  );
}

/**
 * Filter sidebar. A plain GET form, so a filtered view is a shareable URL and works without
 * JavaScript. Only groups the category's records can support are rendered; there is no brand
 * group because no record carries a brand.
 */
export function CategoryFilters({ basePath, query, facets, activeFilters, variant = "category" }: CategoryFiltersProps) {
  const global = variant === "global";
  // In the global variant a group starts open only when it holds a selection (Category and Price are always open).
  const openIf = (selected: number, always = false) => (global ? always || selected > 0 : true);
  const priceActive = query.minPrice !== undefined || query.maxPrice !== undefined;
  const clearHref = listingHref(basePath, query, NO_FILTERS);

  return (
    <Form key={listingHref(basePath, query)} className={styles.form} action={basePath} aria-label="Filter products">
      {query.sort !== "relevance" && <input type="hidden" name="sort" value={query.sort} />}
      {query.view === "list" && <input type="hidden" name="view" value="list" />}
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.limit !== undefined && <input type="hidden" name="limit" value={query.limit} />}
      {query.seller && <input type="hidden" name="seller" value={query.seller} />}
      {query.department.map((value) => (
        <input key={value} type="hidden" name="department" value={value} />
      ))}

      <div className={styles.header}>
        <span className={styles.heading}>
          <Filter size={18} strokeWidth={2} aria-hidden />
          Filter Products
          {activeFilters > 0 && <span className={styles.count} aria-label={`${activeFilters} active filters`}>{activeFilters}</span>}
        </span>
        {activeFilters > 0 ? (
          <Link href={clearHref} className={styles.clear} data-drawer-close>
            Clear All
          </Link>
        ) : (
          <span className={styles.clearOff}>Clear All</span>
        )}
      </div>

      {facets.categories && facets.categories.length > 0 && (
        <Group title="Category" open={openIf(query.category.length, true)}>
          <FilterCheckList
            name="category"
            options={facets.categories}
            selected={query.category}
            searchPlaceholder="Search category..."
          />
        </Group>
      )}

      {facets.subcategories.length > 0 && (
        <Group title={global ? "Subcategory" : "Category"} open={openIf(query.sub.length)}>
          <FilterCheckList
            name="sub"
            options={facets.subcategories}
            selected={query.sub}
            searchPlaceholder={facets.subcategories.length > 6 ? "Search subcategory..." : undefined}
          />
        </Group>
      )}

      {facets.supplierTypes && facets.supplierTypes.length > 0 && (
        <Group title="Supplier Type" open={openIf(query.type.length)}>
          <FilterCheckList name="type" options={facets.supplierTypes} selected={query.type} />
        </Group>
      )}

      {facets.colours && facets.colours.length > 0 && (
        <Group title="Colour" open={openIf(query.colour.length)}>
          <FilterCheckList
            name="colour"
            options={facets.colours}
            selected={query.colour}
            searchPlaceholder={facets.colours.length > 8 ? "Search colour..." : undefined}
          />
        </Group>
      )}

      {facets.moq && (
        <Group title="MOQ (Minimum Order)" open={openIf(query.moq ? 1 : 0)}>
          <ul className={styles.options}>
            <li>
              <label className={styles.option}>
                <input type="radio" name="moq" value="" defaultChecked={!query.moq} />
                <span className={styles.optionLabel}>Any MOQ</span>
              </label>
            </li>
            {facets.moq.map((option) => (
              <li key={option.value}>
                <label className={styles.option}>
                  <input type="radio" name="moq" value={option.value} defaultChecked={query.moq === option.value} />
                  <span className={styles.optionLabel}>{option.label}</span>
                  <span className={styles.optionCount}>({option.count.toLocaleString("en-IN")})</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {facets.price && (
        <Group title="Price Range (₹)" open={global ? true : priceActive}>
          <div className={styles.priceRow}>
            <label className={styles.priceField}>
              <span className="visually-hidden">Minimum price</span>
              <input
                type="number"
                name="minPrice"
                inputMode="numeric"
                min={0}
                placeholder="Min"
                title={`Lowest price: ₹${Math.floor(facets.price.min).toLocaleString("en-IN")}`}
                defaultValue={query.minPrice ?? ""}
                className={styles.priceInput}
              />
            </label>
            <span aria-hidden>to</span>
            <label className={styles.priceField}>
              <span className="visually-hidden">Maximum price</span>
              <input
                type="number"
                name="maxPrice"
                inputMode="numeric"
                min={0}
                placeholder="Max"
                title={`Highest price: ₹${Math.ceil(facets.price.max).toLocaleString("en-IN")}`}
                defaultValue={query.maxPrice ?? ""}
                className={styles.priceInput}
              />
            </label>
          </div>
          <Button type="submit" variant="secondary" className={styles.applyRange}>
            Apply Range
          </Button>
        </Group>
      )}

      {facets.locations.length > 0 && (
        <Group title={global ? "Location (State)" : "Location"} open={global ? query.state.length > 0 : facets.locations.length <= 12 || query.state.length > 0}>
          <FilterCheckList
            name="state"
            options={facets.locations}
            selected={query.state}
            searchPlaceholder={facets.locations.length > 8 ? "Search state..." : undefined}
          />
        </Group>
      )}

      {facets.cities && facets.cities.length > 0 && global && (
        <Group title="City" open={query.city.length > 0}>
          <FilterCheckList
            name="city"
            options={facets.cities}
            selected={query.city}
            searchPlaceholder="Search city..."
          />
        </Group>
      )}

      <Button type="submit" className={styles.apply}>
        Apply Filters{global ? ` (${activeFilters})` : ""}
      </Button>
    </Form>
  );
}

