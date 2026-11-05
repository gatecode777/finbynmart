"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "alertdialog" for a confirmation that needs an explicit answer. */
  role?: "dialog" | "alertdialog";
  /** "drawer" slides in from the right on wide screens and fills the bottom of a phone; "center" is a centred card. */
  variant?: "center" | "drawer";
  /** When true the close button and Escape do nothing (an action is running). */
  busy?: boolean;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * The shared modal dialog: focus moves inside when it opens, Tab and Shift+Tab stay inside, Escape and the backdrop close it,
 * the page behind does not scroll, and focus returns to the control that opened it. Only mount it while it is open.
 */
export function Modal({ title, onClose, children, role = "dialog", variant = "center", busy = false }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // the control marked data-autofocus (the safe choice of a confirmation) wins over the first one in the page, which is the close button
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={clsx(styles.backdrop, variant === "drawer" && styles.backdropDrawer)} onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()} onKeyDown={onKeyDown} role="presentation">
      <div ref={panel} className={clsx(styles.panel, variant === "drawer" && styles.panelDrawer)} role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
