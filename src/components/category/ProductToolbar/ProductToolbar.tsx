"use client";

import { Grid2X2, List } from "lucide-react";
import clsx from "clsx";
import type { SortOption, ViewMode } from "@/types";
import styles from "./ProductToolbar.module.css";

interface ProductToolbarProps {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Relevant", value: "relevance" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Newest", value: "newest" },
];

export function ProductToolbar({
  rangeStart,
  rangeEnd,
  total,
  sort,
  onSortChange,
  view,
  onViewChange,
}: ProductToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <span className={styles.count}>
        {total === 0
          ? "No products match these filters"
          : `Showing ${rangeStart}–${rangeEnd} of ${total} products`}
      </span>

      <div className={styles.right}>
        <label className={styles.sortLabel} htmlFor="product-sort">
          Sort by:
        </label>
        <select
          id="product-sort"
          className={styles.sortSelect}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className={styles.viewToggle} role="group" aria-label="Layout">
          <button
            type="button"
            className={clsx(styles.viewButton, view === "grid" && styles.viewButtonActive)}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => onViewChange("grid")}
          >
            <Grid2X2 size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={clsx(styles.viewButton, view === "list" && styles.viewButtonActive)}
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => onViewChange("list")}
          >
            <List size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
