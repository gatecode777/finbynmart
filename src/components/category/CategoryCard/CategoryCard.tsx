"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CategoryNode } from "@/types";
import { formatCount } from "@/lib/utils/format";
import { CategoryImage } from "./CategoryImage";
import styles from "./CategoryCard.module.css";

interface CategoryCardProps {
  node: CategoryNode;
  /** Parent trail shown on search results, e.g. "Apparel & Fashion › Men Apparel". */
  context?: string;
  /** When set and the category has children, the card explores them instead of leaving the page. */
  onExplore?: (id: string) => void;
}

export function CategoryCard({ node, context, onExplore }: CategoryCardProps) {
  const explores = Boolean(onExplore) && node.childIds.length > 0;
  const href = explores ? `/categories?c=${encodeURIComponent(node.id)}` : node.href;
  const count = `${formatCount(node.productCount)} ${node.productCount === 1 ? "product" : "products"}`;

  return (
    <Link
      href={href}
      className={styles.card}
      aria-label={explores ? `${node.name}, ${count}. Browse subcategories` : `${node.name}, ${count}`}
      onClick={(event) => {
        if (!explores || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onExplore?.(node.id);
      }}
    >
      <span className={styles.media}>
        <CategoryImage src={node.imageSrc} alt="" remote={node.imageRemote} />
      </span>
      <span className={styles.body}>
        <span className={styles.text}>
          <span className={styles.name}>{node.name}</span>
          {context && <span className={styles.context}>{context}</span>}
          <span className={styles.count}>{count}</span>
        </span>
        <span className={styles.arrow} aria-hidden>
          <ArrowRight size={16} strokeWidth={2.25} />
        </span>
      </span>
    </Link>
  );
}
