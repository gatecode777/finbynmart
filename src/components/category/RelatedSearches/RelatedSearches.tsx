import Link from "next/link";
import { Container } from "@/components/ui/Container";
import styles from "./RelatedSearches.module.css";

/**
 * "Related Searches": chips that run a new search. They come from real data (the subcategories of the products
 * the search matched), never from a hand-written list. Renders nothing when there are none.
 */
export function RelatedSearches({ terms }: { terms: string[] }) {
  if (terms.length === 0) return null;
  return (
    <Container>
      <nav className={styles.bar} aria-label="Related searches">
        <span className={styles.label}>Related Searches:</span>
        <ul className={styles.list}>
          {terms.map((term) => (
            <li key={term}>
              <Link href={`/search?q=${encodeURIComponent(term)}`} className={styles.chip}>
                {term}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
