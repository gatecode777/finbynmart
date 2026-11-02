"use client";

import { Children, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./ScrollSlider.module.css";

/** Horizontal scroll-snap slider with prev/next buttons. Children become slides. */
export function ScrollSlider({ children, label }: { children: ReactNode; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.nav} ${styles.prev}`}
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label={`Previous ${label}`}
      >
        <ChevronLeft size={22} aria-hidden />
      </button>
      <div
        ref={trackRef}
        className={styles.track}
        onScroll={update}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {Children.map(children, (child) => (
          <div className={styles.slide}>{child}</div>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.nav} ${styles.next}`}
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label={`Next ${label}`}
      >
        <ChevronRight size={22} aria-hidden />
      </button>
    </div>
  );
}
