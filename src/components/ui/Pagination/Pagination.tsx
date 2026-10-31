import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
  /** Current filters; blank values are dropped from the links. */
  params?: Record<string, string | undefined>;
}

function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, totalPages, basePath, params = {} }: PaginationProps) {
  if (totalPages <= 1) return null;

  function hrefFor(target: number): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav className={styles.nav} aria-label="Pagination">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={styles.step} rel="prev">
          <ChevronLeft size={16} aria-hidden />
          Previous
        </Link>
      ) : (
        <span className={clsx(styles.step, styles.disabled)} aria-disabled="true">
          <ChevronLeft size={16} aria-hidden />
          Previous
        </span>
      )}

      <ul className={styles.pages}>
        {pageWindow(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} className={styles.gap} aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                className={clsx(styles.page, item === page && styles.current)}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ul>

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={styles.step} rel="next">
          Next
          <ChevronRight size={16} aria-hidden />
        </Link>
      ) : (
        <span className={clsx(styles.step, styles.disabled)} aria-disabled="true">
          Next
          <ChevronRight size={16} aria-hidden />
        </span>
      )}
    </nav>
  );
}
