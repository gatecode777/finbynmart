"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Info, LifeBuoy, PackageCheck, RefreshCw, type LucideIcon } from "lucide-react";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { relativeTime, type EventType } from "@/lib/admin/notificationRules";
import type { NotificationItem, NotificationPage } from "@/lib/admin/notifications";
import { ADMIN_NOTIFICATIONS_EVENT } from "./AdminBell";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";
import n from "./AdminNotifications.module.css";

const ICONS: Record<EventType, LucideIcon> = { VERIFICATION_SUBMITTED: ClipboardCheck, PRODUCT_REVISION_SUBMITTED: PackageCheck, SUPPORT_TICKET_CREATED: LifeBuoy };
const abs = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
type Tab = "all" | "unread";

async function call(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: { data?: unknown; message?: string } | null }> {
  try {
    const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

/**
 * The administrator's own inbox. Nothing is optimistic: an item changes only after the server confirmed it, and the unread count shown is always the server's authoritative number (never
 * recomputed from the visible page). A failed load keeps what is on screen and offers Retry (never an empty inbox). A response that arrives after a newer request is ignored.
 */
export function AdminNotificationsWorkspace({ initial }: { initial: NotificationPage | null }) {
  const uid = useId();
  const [tab, setTab] = useState<Tab>("all");
  const [type, setType] = useState<EventType | "all">("all");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIx, setPageIx] = useState(0);
  const [data, setData] = useState<NotificationPage | null>(initial);
  const [error, setError] = useState(initial ? "" : "The notifications could not be loaded.");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [announce, setAnnounce] = useState("");
  const seq = useRef(0);
  const busyIds = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setBusy(true);
    const sp = new URLSearchParams();
    if (tab !== "all") sp.set("tab", tab);
    if (type !== "all") sp.set("type", type);
    if (cursors[pageIx]) sp.set("cursor", cursors[pageIx] as string);
    const r = await call(`/api/admin/notifications${sp.size ? `?${sp}` : ""}`);
    if (mine !== seq.current) return; // a newer request owns the screen
    setBusy(false);
    if (r.ok && r.json?.data) { setData(r.json.data as NotificationPage); setError(""); window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_EVENT)); }
    else setError(r.status === 403 ? "You do not have permission to view notifications." : (r.json?.message as string) ?? (r.status ? "The notifications could not be loaded." : "Network error. Check your connection and retry."));
  }, [tab, type, cursors, pageIx]);

  useEffect(() => {
    if (first.current) { first.current = false; if (!initial) void load(); return; }
    void load();
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeTab = (t: Tab) => { setTab(t); setCursors([null]); setPageIx(0); };
  const changeType = (v: string) => { setType(v as EventType | "all"); setCursors([null]); setPageIx(0); };
  function next() { if (!data?.nextCursor) return; setCursors((c) => [...c.slice(0, pageIx + 1), data.nextCursor]); setPageIx((i) => i + 1); }

  async function markOne(it: NotificationItem) {
    if (busyIds.current.has(it.id)) return;
    busyIds.current.add(it.id);
    setPending((p) => new Set(p).add(it.id));
    const r = await call(`/api/admin/notifications/${it.id}/read`, { method: "PATCH" });
    busyIds.current.delete(it.id);
    setPending((p) => { const x = new Set(p); x.delete(it.id); return x; });
    if (!r.ok) { flashToast("error", "Not marked as read. Please try again."); setError("We couldn't mark that notification as read. It is still unread."); return; }
    setError("");
    const count = (r.json?.data as { unreadCount: number }).unreadCount;
    setData((d) => d && { ...d, unreadCount: count, items: tab === "unread" ? d.items.filter((x) => x.id !== it.id) : d.items.map((x) => (x.id === it.id ? { ...x, read: true } : x)) });
    setAnnounce(`${it.title} marked as read. ${count} unread.`);
    window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_EVENT));
  }

  async function markAll() {
    if (markingAll) return;
    setMarkingAll(true);
    const r = await call("/api/admin/notifications/read-all", { method: "POST" });
    setMarkingAll(false);
    if (!r.ok) { flashToast("error", "Not marked as read. Please try again."); setError("We couldn't mark your notifications as read. Nothing was changed."); return; }
    setError("");
    flashToast("success", "Notifications marked as read.");
    setAnnounce("All notifications up to now were marked as read.");
    setCursors([null]); setPageIx(0); setTick((t) => t + 1);
  }

  const supported = data?.supportedTypes ?? [];
  const noPerm = data !== null && supported.length === 0;
  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
      <div className={n.top}>
        <div className={n.tabs} role="tablist" aria-label="Notification list">
          {(["all", "unread"] as const).map((t) => (
            <button key={t} type="button" role="tab" id={`${uid}-${t}`} aria-selected={tab === t} className={n.tab} onClick={() => changeTab(t)}>{t === "all" ? "All" : `Unread (${unread > 99 ? "99+" : unread})`}</button>
          ))}
        </div>
        <button type="button" className={prof.btnSecondary} onClick={markAll} disabled={markingAll || unread === 0 || noPerm}>{markingAll ? "Marking…" : "Mark all as read"}</button>
      </div>
      <div className={n.filters}>
        <div className={m.field}>
          <label htmlFor={`${uid}-type`} className={m.lbl}>Event type</label>
          <Dropdown id={`${uid}-type`} value={type} onChange={changeType} options={[{ value: "all", label: "All types" }, ...supported.map((t) => ({ value: t.key, label: t.label }))]} />
        </div>
        <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)} disabled={busy}><RefreshCw size={16} aria-hidden /> {busy ? "Refreshing…" : "Refresh"}</button>
      </div>

      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Notifications" aria-busy={busy} role="tabpanel" aria-labelledby={`${uid}-${tab}`}>
        {!data ? (
          busy ? <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul> : null
        ) : noPerm ? (
          <p className={s.empty}>Your account has no permission that produces notifications yet. Notifications appear for the work you are authorized to review.</p>
        ) : items.length === 0 ? (
          <p className={s.empty}>{type !== "all" ? "No notifications of this type." : tab === "unread" ? "No unread notifications." : "No notifications yet. Updates will appear here when relevant events occur."}</p>
        ) : (
          <ul className={n.list} aria-label={tab === "unread" ? "Unread notifications" : "All notifications"}>
            {items.map((it) => {
              const Icon = ICONS[it.type];
              return (
                <li key={it.id} className={`${n.item} ${it.read ? "" : n.unread}`}>
                  <span className={n.icon} aria-hidden><Icon size={22} /></span>
                  <div className={n.body}>
                    <p className={n.title}>{!it.read && <><span className={n.dot} aria-hidden /><span className="visually-hidden">Unread. </span></>}{it.title}{!it.read && <span className={n.badge}>Unread</span>}</p>
                    <p className={n.desc}>{it.description}</p>
                  </div>
                  <time className={n.time} dateTime={it.occurredAt} title={abs(it.occurredAt)}>{relativeTime(it.occurredAt)}</time>
                  <div className={n.actions}>
                    <Link prefetch={false} href={it.link} className={n.link} aria-label={`${it.linkLabel}: ${it.title}`}>{it.linkLabel}</Link>
                    {!it.read && <button type="button" className={n.mark} disabled={pending.has(it.id)} onClick={() => markOne(it)} aria-label={`Mark "${it.title}" as read`}>{pending.has(it.id) ? "Marking…" : "Mark as read"}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className={s.pager}>
          <span className={s.note} style={{ margin: 0 }}><Info size={14} aria-hidden /> Reading a notification does not complete the related task. Each notification is a record of an event, not the current state of the work.</span>
          <span className={s.pagerBtns}>
            <button type="button" className={prof.btnSecondary} disabled={pageIx === 0 || busy} onClick={() => setPageIx((i) => i - 1)}>Previous</button>
            <button type="button" className={prof.btnSecondary} disabled={!data?.nextCursor || busy} onClick={next}>Next</button>
          </span>
        </div>
      </section>
    </>
  );
}
