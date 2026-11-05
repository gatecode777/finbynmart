"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCheck, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { NOTIFICATION_FILTER_CATEGORIES, NOTIFICATION_STATUSES, isSafeNotificationLink, type NotificationQuery } from "@/lib/buyer/notificationRules";
import type { NotificationList } from "@/lib/buyer/notifications";
import { NOTIFICATIONS_CHANGED } from "./notificationEvents";
import dash from "../Dashboard.module.css";
import profile from "../profile/Profile.module.css";
import styles from "./Settings.module.css";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const categoryLabel = (value: string) => NOTIFICATION_FILTER_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/**
 * The buyer's notifications: category and read/unread filters (kept in the address), 20 per page, mark one or all as read, and
 * a link only when it points inside the buyer area. Nothing is shown as read until the server confirmed it.
 */
export function NotificationCenter({ initial, initialQuery }: { initial: NotificationList; initialQuery: NotificationQuery }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (next: NotificationQuery) => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ category: next.category, status: next.status, page: String(next.page), limit: String(next.limit) });
    const res = await fetch(`/api/buyer/notifications?${params}`).catch(() => null);
    if (mine !== request.current) return; // a newer request replaced this one
    const body = res ? await res.json().catch(() => null) : null;
    setLoading(false);
    if (!res?.ok || !body?.ok) {
      setError(res?.status === 401 ? "Your session ended. Sign in again to see your notifications." : "Notifications could not be loaded. Try again.");
      return;
    }
    const result = body.data as NotificationList;
    if (result.notifications.length === 0 && next.page > 1) {
      // the last item of this page was just read (or removed): show the previous page instead of an empty one
      const back = { ...next, page: Math.max(1, Math.min(next.page - 1, result.meta.totalPages || 1)) };
      setQuery(back);
      void load(back);
      return;
    }
    setData(result);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "notifications");
    for (const [key, value] of [["category", next.category], ["status", next.status], ["page", String(next.page)]] as const) {
      if (value === "all" || (key === "page" && value === "1")) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const refresh = () => void load(query);
    // the bell panel changed something (marked read): show it here too; the centre ignores its own events
    const fromBell = (event: Event) => (event as CustomEvent<{ source?: string }>).detail?.source === "bell" && void load(query);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, fromBell);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, fromBell);
    };
  }, [load, query]);

  const change = (patch: Partial<NotificationQuery>) => {
    const next = { ...query, ...patch, page: patch.page ?? 1 };
    setQuery(next);
    setMessage(null);
    void load(next);
  };

  async function markOne(id: string) {
    if (busyId) return;
    setBusyId(id);
    setMessage(null);
    const res = await fetch(`/api/buyer/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      setError("It could not be marked as read. Try again.");
      return;
    }
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { source: "center" } }));
    await load(query);
  }

  async function markAll() {
    if (busyId) return;
    setBusyId("all");
    setMessage(null);
    // the server marks at most 200 per request and says when more remain: repeat until none do (up to 150 requests)
    const path = `/api/buyer/notifications/read-all${query.category === "all" ? "" : `?category=${query.category}`}`;
    let total = 0;
    let more = false;
    for (let round = 0; round < 150; round++) {
      const res = await fetch(path, { method: "PATCH" }).catch(() => null);
      const body = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !body?.ok) {
        setBusyId(null);
        setError(total > 0 ? `${total} were marked as read, then it stopped. Try again for the rest.` : "They could not be marked as read. Try again.");
        window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { source: "center" } }));
        return;
      }
      total += body.data.changed as number;
      more = Boolean(body.data.more);
      if (!more) break;
    }
    setBusyId(null);
    setMessage(total === 0 ? "There was nothing unread." : more ? `${total} marked as read. More are still unread: choose Mark all as read again.` : "Marked as read.");
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { source: "center" } }));
    await load(query);
  }

  const { notifications, meta, unread } = data;
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);
  const filtered = query.category !== "all" || query.status !== "all";

  return (
    <section className={dash.card} aria-labelledby="center-title">
      <div className={styles.centerHead}>
        <h2 id="center-title" className={dash.cardTitle}>Notifications</h2>
        <button type="button" className={styles.smallButton} onClick={markAll} disabled={busyId !== null || unread === 0}>
          <CheckCheck size={18} aria-hidden /> {busyId === "all" ? "Marking..." : query.category === "all" ? "Mark all as read" : "Mark these as read"}
        </button>
      </div>

      <div className={styles.filterRow} role="group" aria-label="Filter notifications by status">
        <span className={styles.filterLabel}>Show</span>
        <div className={styles.filterScroll}>
          {NOTIFICATION_STATUSES.map((s) => (
            <button key={s.value} type="button" className={clsx(styles.chipButton, query.status === s.value && styles.chipButtonActive)} aria-pressed={query.status === s.value} onClick={() => change({ status: s.value })}>
              {s.label}{s.value === "unread" ? ` (${unread >= 100 ? "99+" : unread})` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterRow} role="group" aria-label="Filter notifications by category">
        <span className={styles.filterLabel}>Type</span>
        <div className={styles.filterScroll}>
          {NOTIFICATION_FILTER_CATEGORIES.map((c) => (
            <button key={c.value} type="button" className={clsx(styles.chipButton, query.category === c.value && styles.chipButtonActive)} aria-pressed={query.category === c.value} onClick={() => change({ category: c.value })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {message && <p className={clsx(profile.banner, profile.bannerOk)} role="status">{message}</p>}
        {error && (
          <p className={clsx(profile.banner, profile.bannerError)} role="alert">
            {error}{" "}
            <button type="button" className={styles.smallButton} onClick={() => void load(query)}>Try again</button>
          </p>
        )}
      </div>

      {notifications.length === 0 && !error ? (
        <div className={styles.emptyBox}>
          <h3 className={styles.emptyTitle}>{filtered ? "No notifications match these filters" : "No notifications yet"}</h3>
          <p className={styles.summaryText}>
            {filtered ? "Try another filter." : "Notices appear here when something happens in your account, for example when you send an inquiry or upload a company document."}
          </p>
          {filtered && <button type="button" className={styles.smallButton} onClick={() => change({ category: "all", status: "all" })}>Clear filters</button>}
        </div>
      ) : (
        <>
          <p className={styles.summaryText} aria-live="polite">{loading ? "Loading..." : `Showing ${first}-${last} of ${meta.total}`}</p>
          <ul className={styles.notifList} aria-busy={loading}>
            {notifications.map((n) => (
              <li key={n.id} className={clsx(styles.notif, !n.read && styles.notifUnread)}>
                <div className={styles.notifTop}>
                  {!n.read && <span className={styles.newTag}>New</span>}
                  <h3 className={styles.notifTitle}>{n.title}</h3>
                  <span className={styles.categoryTag}>{categoryLabel(n.category)}</span>
                </div>
                <p className={styles.notifBody}>{n.body}</p>
                <div className={styles.notifFoot}>
                  <time className={styles.notifTime} dateTime={n.createdAt}>{when(n.createdAt)}</time>
                  {n.link && isSafeNotificationLink(n.link) && (
                    <Link href={n.link} className={styles.smallButton} onClick={() => !n.read && void markOne(n.id)}>
                      <ExternalLink size={16} aria-hidden /> Open
                    </Link>
                  )}
                  {!n.read && (
                    <button type="button" className={styles.smallButton} onClick={() => markOne(n.id)} disabled={busyId !== null}>
                      {busyId === n.id ? "Marking..." : "Mark as read"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {meta.totalPages > 1 && (
            <nav className={styles.pager} aria-label="Notification pages">
              <button type="button" className={styles.smallButton} onClick={() => change({ page: meta.page - 1 })} disabled={meta.page <= 1 || loading}>
                <ChevronLeft size={16} aria-hidden /> Previous
              </button>
              <span className={styles.summaryText}>Page {meta.page} of {meta.totalPages}</span>
              <button type="button" className={styles.smallButton} onClick={() => change({ page: meta.page + 1 })} disabled={meta.page >= meta.totalPages || loading}>
                Next <ChevronRight size={16} aria-hidden />
              </button>
            </nav>
          )}
        </>
      )}
      <p className={styles.fieldHint}>Notifications are kept for 180 days. Only events in this account create them; no email, SMS or WhatsApp is sent.</p>
    </section>
  );
}
