"use client";

import { useRef } from "react";
import Form from "next/form";
import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";
import { SORT_OPTIONS } from "@/lib/catalog/listingQuery";
import styles from "./ListingToolbar.module.css";

interface ListingToolbarProps {
  action: string;
  /** Every other active parameter, kept when the sort changes. */
  hidden: [string, string][];
  sort: string;
  /** Sort choices; defaults to the product sorts. */
  sortOptions?: { value: string; label: string }[];
  /** The grid/list toggle is shown only when all three are given. */
  view?: "grid" | "list";
  gridHref?: string;
  listHref?: string;
}

/** Sort selector (submits on change; a button covers no-JavaScript use) and the grid/list toggle. */
export function ListingToolbar({ action, hidden, sort, sortOptions = SORT_OPTIONS, view, gridHref, listHref }: ListingToolbarProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className={styles.toolbar}>
      <Form key={`${sort}|${hidden.map((h) => h.join("=")).join("&")}`} ref={formRef} action={action} className={styles.sort}>
        {hidden.map(([name, value], index) => (
          <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
        ))}
        <span className={styles.label} aria-hidden>
          Sort By:
        </span>
        <Select
          label="Sort by"
          hideLabel
          name="sort"
          defaultValue={sort}
          onChange={() => formRef.current?.requestSubmit()}
          options={sortOptions}
        />
        <noscript>
          <button type="submit">Apply</button>
        </noscript>
      </Form>

      {view && gridHref && listHref && (
      <div className={styles.view} role="group" aria-label="Product view">
        <span className={styles.label} aria-hidden>
          View:
        </span>
        <div className={styles.toggle}>
          <Link href={gridHref} className={clsx(styles.toggleButton, view === "grid" && styles.on)} aria-label="Grid view" aria-current={view === "grid" ? "true" : undefined}>
            <LayoutGrid size={18} strokeWidth={2} aria-hidden />
          </Link>
          <Link href={listHref} className={clsx(styles.toggleButton, view === "list" && styles.on)} aria-label="List view" aria-current={view === "list" ? "true" : undefined}>
            <List size={18} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}
