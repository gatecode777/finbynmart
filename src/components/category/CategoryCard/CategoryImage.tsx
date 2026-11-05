"use client";

import { useState } from "react";
import Image from "next/image";
import { LayoutGrid } from "lucide-react";
import styles from "./CategoryCard.module.css";

/** Category photo with a branded fallback when no valid image exists or a remote one fails to load. */
export function CategoryImage({ src, alt, remote, priority, sizes }: { src?: string; alt: string; remote?: boolean; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={styles.fallback} role="img" aria-label={alt}>
        <LayoutGrid size={32} strokeWidth={1.5} aria-hidden />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes ?? "(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"}
      // Hot-linked product photos load straight in the visitor's browser; we never proxy or copy them.
      unoptimized={remote}
      onError={() => setFailed(true)}
      className={styles.image}
    />
  );
}
