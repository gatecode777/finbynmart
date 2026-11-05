"use client";

import { useId, useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { FacetOption } from "@/lib/catalog/listingQuery";
import styles from "./CategoryFilters.module.css";

interface FilterCheckListProps {
  name: string;
  options: FacetOption[];
  selected: string[];
  searchPlaceholder?: string;
  initialVisible?: number;
}

/**
 * Checkbox list that lives inside the filter <form>. Options hidden by "View More" or by the search
 * box stay in the DOM (just hidden), so their checked state is still submitted with the form.
 */
export function FilterCheckList({ name, options, selected, searchPlaceholder, initialVisible = 5 }: FilterCheckListProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const needle = query.trim().toLowerCase();
  const matching = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const matchingValues = new Set(matching.map((option) => option.value));
  const limited = !needle && !showAll;
  // The first few plus anything already selected, so a chosen option is never tucked away.
  const visibleValues = new Set(
    limited
      ? [...options.slice(0, initialVisible).map((o) => o.value), ...selected]
      : matching.map((option) => option.value),
  );
  const hiddenCount = options.length - options.slice(0, initialVisible).length;

  return (
    <div className={styles.list}>
      {searchPlaceholder && (
        <>
          <label htmlFor={searchId} className="visually-hidden">
            {searchPlaceholder}
          </label>
          <input
            id={searchId}
            type="search"
            className={styles.search}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </>
      )}

      <ul className={styles.options}>
        {options.map((option) => {
          const shown = visibleValues.has(option.value) && matchingValues.has(option.value);
          return (
            <li key={option.value} hidden={!shown}>
              <label className={styles.option}>
                <input type="checkbox" name={name} value={option.value} defaultChecked={selected.includes(option.value)} />
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionCount}>({option.count.toLocaleString("en-IN")})</span>
              </label>
            </li>
          );
        })}
      </ul>

      {needle && matching.length === 0 && <p className={styles.none}>No matches</p>}

      {!needle && options.length > initialVisible && (
        <button type="button" className={styles.more} onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
          {showAll ? <Minus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {showAll ? "View Less" : `View More (${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
