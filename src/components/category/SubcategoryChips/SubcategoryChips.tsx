"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Container } from "@/components/ui/Container";
import styles from "./SubcategoryChips.module.css";

export interface Chip {
  label: string;
  href: string;
  active: boolean;
}

interface SubcategoryChipsProps {
  chips: Chip[];
  /** Heading of the row, e.g. "Popular Subcategories". */
  label?: string;
  /** An "All" chip placed first (clears a selection, or returns to the parent category). */
  allHref?: string;
  allLabel?: string;
  /** How many chips show before "More". */
  initialVisible?: number;
}

/** Popular subcategories: a single scrollable row, with "More" revealing the rest. */
export function SubcategoryChips({ chips, label = "Popular Subcategories", allHref, allLabel = "All", initialVisible = 6 }: SubcategoryChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (chips.length === 0) return null;

  const shown = expanded ? chips : chips.slice(0, initialVisible);
  const hidden = chips.length - shown.length;

  return (
    <Container>
      <nav className={styles.panel} aria-label={label}>
        <span className={styles.label}>{label}</span>
        <ul className={clsx(styles.row, expanded && styles.wrap)}>
          {allHref && (
            <li>
              <Link href={allHref} className={styles.chip}>
                {allLabel}
              </Link>
            </li>
          )}
          {shown.map((chip) => (
            <li key={chip.href}>
              <Link
                href={chip.href}
                className={clsx(styles.chip, chip.active && styles.active)}
                aria-current={chip.active ? "true" : undefined}
              >
                {chip.label}
              </Link>
            </li>
          ))}
          {(hidden > 0 || expanded) && chips.length > initialVisible && (
            <li>
              <button
                type="button"
                className={clsx(styles.chip, styles.more)}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Less" : `More (${hidden})`}
                <ChevronDown size={16} className={clsx(styles.chevron, expanded && styles.open)} aria-hidden />
              </button>
            </li>
          )}
        </ul>
      </nav>
    </Container>
  );
}
