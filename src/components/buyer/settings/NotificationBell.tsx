"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bell, CheckCheck } from "lucide-react";
import { isSafeNotificationLink } from "@/lib/buyer/notificationRules";
import type { NotificationDto } from "@/lib/buyer/notifications";
import shell from "../BuyerShell.module.css";
import { NOTIFICATIONS_CHANGED } from "./notificationEvents";
import styles from "./Settings.module.css";

const POLL_MS = 60_000;
const PANEL_SIZE = 8;

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * The top bar bell. It shows the real unread count (capped at 99+) and opens a panel with the buyer's latest notifications:
 * unread first by default, a switch to all, "Mark all as read", and a click on a notification marks it read and opens its page
 * (only a safe internal link). "View all" goes to the full centre. The count is read from the server when the page loads, when the
 * window regains focus, after anything changes it, and once a minute while the tab is visible; if it cannot be read, no number is shown.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"unread" | "all">("unread");
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const panelId = useId();

  const refreshCount = useCallback(async () => {
    const res = await fetch("/api/buyer/notifications/unread-count", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setUnread(body?.ok ? (body.data.unread as number) : null);
  }, []);

  const loadItems = useCallback(async (next: "unread" | "all") => {
    const mine = ++request.current;
    setError(false);
    const res = await fetch(`/api/buyer/notifications?status=${next}&limit=${PANEL_SIZE}`, { cache: "no-store" }).catch(() => null);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body?.ok) {
      setError(true);
      setItems([]);
      return;
    }
    const list = body.data.notifications as NotificationDto[];
    if (next === "unread" && list.length === 0) {
      // nothing unread: show the latest instead of an empty box
      setView("all");
      void loadItems("all");
      return;
    }
    setView(next);
    setItems(list);
    setUnread(body.data.unread as number);
  }, []);

  useEffect(() => {
    void refreshCount();
    const onChange = () => {
      void refreshCount();
    };
    const tick = window.setInterval(() => document.visibilityState === "visible" && void refreshCount(), POLL_MS);
    window.addEventListener("focus", onChange);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("focus", onChange);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      } else if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setItems(null);
    void loadItems("unread").then(() => heading.current?.focus());
  }

  const announce = () => window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { source: "bell" } }));

  async function markOne(id: string) {
    const res = await fetch(`/api/buyer/notifications/${id}/read`, { method: "PATCH", keepalive: true }).catch(() => null);
    if (res?.ok) announce();
    return Boolean(res?.ok);
  }

  async function open1(n: NotificationDto) {
    setOpen(false);
    if (!n.read) await markOne(n.id);
  }

  async function markAll() {
    if (busy) return;
    setBusy(true);
    // the server marks at most 200 per request and says when more remain
    for (let round = 0; round < 150; round++) {
      const res = await fetch("/api/buyer/notifications/read-all", { method: "PATCH" }).catch(() => null);
      const body = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !body?.ok) {
        setError(true);
        break;
      }
      if (!body.data.more) break;
    }
    setBusy(false);
    announce();
    await loadItems(view);
  }

  const text = unread === null ? null : unread >= 100 ? "99+" : String(unread);
  const label = unread === null ? "Notifications" : unread === 0 ? "Notifications, none unread" : `Notifications, ${text} unread`;

  return (
    <div className={styles.bellRoot} ref={wrap}>
      <button ref={button} type="button" className={clsx(shell.topAction, styles.bellWrap)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={toggle}>
        <Bell size={20} aria-hidden />
        {unread ? <span className={styles.bellBadge} aria-hidden>{text}</span> : null}
      </button>
      {open && (
        <div id={panelId} className={styles.bellPanel} role="dialog" aria-label="Notifications">
          <div className={styles.bellPanelHead}>
            <h2 className={styles.bellPanelTitle} ref={heading} tabIndex={-1}>Notifications</h2>
            <button type="button" className={styles.bellTextButton} onClick={markAll} disabled={busy || !unread}>
              <CheckCheck size={16} aria-hidden /> {busy ? "Marking..." : "Mark all as read"}
            </button>
          </div>
          <div className={styles.bellTabs} role="group" aria-label="Show notifications">
            <button type="button" className={clsx(styles.bellTab, view === "unread" && styles.bellTabActive)} aria-pressed={view === "unread"} onClick={() => { setItems(null); void loadItems("unread"); }}>
              Unread{unread ? ` (${text})` : ""}
            </button>
            <button type="button" className={clsx(styles.bellTab, view === "all" && styles.bellTabActive)} aria-pressed={view === "all"} onClick={() => { setItems(null); setView("all"); void loadItems("all"); }}>
              All
            </button>
          </div>
          <div aria-live="polite">
            {items === null && <p className={styles.bellNote}>Loading...</p>}
            {error && (
              <p className={styles.bellNote} role="alert">
                Notifications could not be loaded.{" "}
                <button type="button" className={styles.bellTextButton} onClick={() => { setItems(null); void loadItems(view); }}>Try again</button>
              </p>
            )}
            {items !== null && !error && items.length === 0 && <p className={styles.bellNote}>No notifications yet.</p>}
          </div>
          {items && items.length > 0 && (
            <ul className={styles.bellList}>
              {items.map((n) => {
                const safe = n.link && isSafeNotificationLink(n.link) ? n.link : null;
                const body = (
                  <>
                    <span className={styles.bellItemTop}>
                      {!n.read && <span className={styles.newTag}>New</span>}
                      <span className={styles.bellItemTitle}>{n.title}</span>
                    </span>
                    <span className={styles.bellItemBody}>{n.body}</span>
                    <time className={styles.notifTime} dateTime={n.createdAt}>{when(n.createdAt)}</time>
                  </>
                );
                return (
                  <li key={n.id} className={clsx(styles.bellItem, !n.read && styles.bellItemUnread)}>
                    {safe ? (
                      <Link href={safe} className={styles.bellItemAction} onClick={() => void open1(n)}>{body}</Link>
                    ) : (
                      <button type="button" className={styles.bellItemAction} onClick={() => void (n.read ? Promise.resolve() : markOne(n.id).then(() => loadItems(view)))} aria-label={n.read ? n.title : `${n.title}. Mark as read`}>{body}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.bellFoot}>
            <Link href="/buyer/settings?tab=notifications" className={styles.link} onClick={() => setOpen(false)}>View all notifications</Link>
          </div>
        </div>
      )}
    </div>
  );
}
