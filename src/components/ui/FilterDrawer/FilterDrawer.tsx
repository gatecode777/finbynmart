"use client";

import { ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import styles from "./FilterDrawer.module.css";
import { lockBodyScroll } from "@/lib/utils/scrollLock";

interface FilterDrawerProps {
  children: ReactNode;
  /** Below this width the filters move into a slide-in drawer. */
  breakpoint?: "md" | "lg";
  label?: string;
  activeCount?: number;
  /** The "Show results" button; turn off when the content has its own submit button. */
  showFooter?: boolean;
}

const QUERY = { md: "(max-width: 767px)", lg: "(max-width: 990px)" } as const;

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Inline on wide screens; on narrow screens a "Filters" button opens the same
 * content in a drawer (Escape, overlay click and the close button dismiss it,
 * focus returns to the button). The children stay mounted so form state survives.
 */
export function FilterDrawer({ children, breakpoint = "md", label = "Filters", activeCount = 0, showFooter = true }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const narrow = useMediaQuery(QUERY[breakpoint]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const isOpen = open && narrow;

  useEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const unlock = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlock();
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <div className={clsx(styles.root, styles[breakpoint])}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={17} strokeWidth={2} aria-hidden />
        {label}
        {activeCount > 0 && <span className={styles.count}>{activeCount}</span>}
      </button>

      {isOpen && <div className={styles.overlay} onClick={() => setOpen(false)} aria-hidden />}

      <div
        id={panelId}
        className={clsx(styles.panel, isOpen && styles.open)}
        role={narrow ? "dialog" : undefined}
        aria-modal={narrow ? true : undefined}
        aria-label={narrow ? label : undefined}
        // Closed drawer content must not be reachable by keyboard or screen reader.
        inert={narrow && !isOpen}
      >
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>{label}</span>
          <button ref={closeRef} type="button" className={styles.close} aria-label={`Close ${label.toLowerCase()}`} onClick={() => setOpen(false)}>
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div
          className={styles.panelBody}
          onClick={(event) => {
            // Anything marked data-drawer-close (e.g. a category link) dismisses the drawer on selection.
            if ((event.target as HTMLElement).closest("[data-drawer-close]")) setOpen(false);
          }}
          // Submitting a filter form navigates on the client (the page is not reloaded), so the drawer closes itself.
          onSubmit={() => setOpen(false)}
        >
          {children}
        </div>
        {showFooter && (
          <div className={styles.panelFooter}>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>
              Show results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
