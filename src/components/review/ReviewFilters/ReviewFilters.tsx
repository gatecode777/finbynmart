import Form from "next/form";
import Link from "next/link";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterCheckList } from "@/components/category/CategoryFilters";
import type { ReviewView } from "@/lib/reviews/engine";
import { NO_REVIEW_FILTERS, reviewHref, type ReviewFacetOption, type ReviewQuery } from "@/lib/reviews/query";
import styles from "@/components/category/CategoryFilters/CategoryFilters.module.css";
import local from "./ReviewFilters.module.css";

interface ReviewFiltersProps {
  basePath: string;
  query: ReviewQuery;
  facets: ReviewView["facets"];
  activeFilters: number;
}

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

function RadioList({ name, options, value }: { name: string; options: ReviewFacetOption[]; value: string }) {
  return (
    <ul className={styles.options}>
      {options.map((option) => (
        <li key={option.value || "all"}>
          <label className={styles.option}>
            <input type="radio" name={name} value={option.value} defaultChecked={value === option.value} />
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.optionCount}>({option.count.toLocaleString("en-IN")})</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * Filter sidebar for one supplier's reviews: a plain GET form (a filtered view is a shareable URL and works without
 * JavaScript) that reuses the look of the product filters. Groups come from the supplier's own reviews: topics only
 * where buyers rated them, and the buyer-type group only where some review is verified.
 */
export function ReviewFilters({ basePath, query, facets, activeFilters }: ReviewFiltersProps) {
  const clearHref = reviewHref(basePath, query, NO_REVIEW_FILTERS);
  const buyerType = facets.buyerType?.map((option) => ({ ...option, value: option.value === "verified" ? "1" : "" }));

  return (
    <Form key={reviewHref(basePath, query)} className={`${styles.form} ${local.tight}`} action={basePath} aria-label="Filter reviews">
      {query.sort !== "relevant" && <input type="hidden" name="sort" value={query.sort} />}
      {query.limit !== undefined && <input type="hidden" name="limit" value={query.limit} />}

      <div className={styles.header}>
        <span className={`${styles.heading} ${local.heading}`}>
          <Filter size={18} strokeWidth={2} aria-hidden />
          Filter Reviews
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

      <Group title="Rating" open>
        <FilterCheckList name="rating" options={facets.rating} selected={query.rating.map(String)} initialVisible={5} />
      </Group>

      {facets.category.length > 0 && (
        <Group title="Review For" open>
          <FilterCheckList name="category" options={facets.category} selected={query.category} />
        </Group>
      )}

      {buyerType && (
        <Group title="Buyer Type" open>
          <RadioList name="verified" options={buyerType} value={query.verified ? "1" : ""} />
        </Group>
      )}

      <Group title="Review Date" open={query.range !== ""}>
        <RadioList name="range" options={facets.range} value={query.range} />
      </Group>

      <Button type="submit" className={styles.apply}>
        Apply Filters ({activeFilters})
      </Button>
    </Form>
  );
}
