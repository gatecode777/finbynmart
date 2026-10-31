import Link from "next/link";
import { POPULAR_SEARCHES } from "@/lib/constants/navigation";
import styles from "./PopularSearches.module.css";

export function PopularSearches() {
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Popular Searches:</span>
      {POPULAR_SEARCHES.map((term) => (
        <Link
          key={term}
          href={`/search?type=products&q=${encodeURIComponent(term)}`}
          className={styles.chip}
        >
          {term}
        </Link>
      ))}
    </div>
  );
}
