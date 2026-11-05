"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { FLASH_EVENT, FLASH_KEY, FLASH_MAX_AGE_MS, type ToastKind } from "./flash";
import styles from "./Toast.module.css";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const VISIBLE_MS = 6000;
const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;

/**
 * The one toast area of the site, mounted once in the root layout. It shows the flash message left by the previous action
 * (read on first load, after every navigation and when a new flash is announced), for six seconds; hovering or focusing it keeps
 * it open; the close button dismisses it. Success and info are polite status messages, errors are alerts.
 */
export function ToastHost() {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const read = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(FLASH_KEY);
      if (raw) window.sessionStorage.removeItem(FLASH_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const flash = JSON.parse(raw) as { kind?: ToastKind; text?: string; at?: number };
      if (typeof flash.text !== "string" || !flash.text || typeof flash.at !== "number" || Date.now() - flash.at > FLASH_MAX_AGE_MS) return;
      const kind: ToastKind = flash.kind === "error" || flash.kind === "info" ? flash.kind : "success";
      setToasts((current) => [...current.slice(-2), { id: nextId.current++, kind, text: flash.text!.slice(0, 160) }]);
    } catch {
      /* a damaged flash is dropped */
    }
  }, []);

  useEffect(() => {
    read();
  }, [pathname, read]);

  useEffect(() => {
    window.addEventListener(FLASH_EVENT, read);
    return () => window.removeEventListener(FLASH_EVENT, read);
  }, [read]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  return (
    <div className={styles.region} aria-label="Notifications from the site">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

const LEAVE_MS = 200;

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const Icon = ICONS[toast.kind];

  // it fades out before it is removed, so it never just vanishes
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_MS);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (paused || leaving) return;
    const timer = window.setTimeout(close, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, leaving, close]);

  return (
    <div
      className={clsx(styles.toast, styles[toast.kind], leaving && styles.leaving)}
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.iconWrap} aria-hidden>
        <Icon size={18} strokeWidth={2.5} />
      </span>
      <p className={styles.text}>{toast.text}</p>
      <button type="button" className={styles.close} onClick={close} aria-label="Dismiss message">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
