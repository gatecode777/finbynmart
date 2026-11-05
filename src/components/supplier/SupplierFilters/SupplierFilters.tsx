import Form from "next/form";
import Link from "next/link";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterCheckList } from "@/components/category/CategoryFilters/FilterCheckList";
import styles from "@/components/category/CategoryFilters/CategoryFilters.module.css";
import type { SupplierListing } from "@/lib/catalog/supplierListing";
import { NO_SUPPLIER_FILTERS, supplierHref, type SupplierQuery } from "@/lib/catalog/supplierQuery";

function Group({ title, children, open }: { title: string; children: React.ReactNode; open: boolean }) {
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
 * Supplier directory filters. A plain GET form (next/form on the client) so every filtered view is a link.
 * Only groups the data supports exist: industry (the supplier's specialisation), state, city and the product
 * categories the supplier really sells in. Verification appears only if some supplier is verified (none is).
 * There is no supplier type, business type, years in business, turnover or certification group: no such data.
 */
export function SupplierFilters({ basePath, query, facets, activeFilters }: { basePath: string; query: SupplierQuery; facets: SupplierListing["facets"]; activeFilters: number }) {
  const clearHref = supplierHref(basePath, query, NO_SUPPLIER_FILTERS);
  return (
    <Form key={supplierHref(basePath, query)} className={styles.form} action={basePath} aria-label="Filter suppliers">
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.sort !== "relevance" && <input type="hidden" name="sort" value={query.sort} />}
      {query.view === "list" && <input type="hidden" name="view" value="list" />}
      {query.limit !== undefined && <input type="hidden" name="limit" value={query.limit} />}

      <div className={styles.header}>
        <span className={styles.heading}>
          <Filter size={18} strokeWidth={2} aria-hidden />
          Filter Suppliers
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

      {facets.verification && facets.verification.length > 0 && (
        <Group title="Verification Status" open>
          <FilterCheckList name="verification" options={facets.verification} selected={query.verification} />
        </Group>
      )}

      {facets.industries.length > 0 && (
        <Group title="Industry" open>
          <FilterCheckList name="industry" options={facets.industries} selected={query.industry} searchPlaceholder={facets.industries.length > 6 ? "Search industry..." : undefined} />
        </Group>
      )}

      {facets.categories.length > 0 && (
        <Group title="Product Category" open={query.category.length > 0}>
          <FilterCheckList name="category" options={facets.categories} selected={query.category} searchPlaceholder="Search category..." />
        </Group>
      )}

      {facets.states.length > 0 && (
        <Group title="Location (State)" open={query.state.length > 0}>
          <FilterCheckList name="state" options={facets.states} selected={query.state} searchPlaceholder={facets.states.length > 8 ? "Search state..." : undefined} />
        </Group>
      )}

      {facets.cities.length > 0 && (
        <Group title="City" open={query.city.length > 0}>
          <FilterCheckList name="city" options={facets.cities} selected={query.city} searchPlaceholder="Search city..." />
        </Group>
      )}

      <Button type="submit" className={styles.apply}>
        Apply Filters ({activeFilters})
      </Button>
    </Form>
  );
}
