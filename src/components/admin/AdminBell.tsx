"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { badgeText } from "@/lib/admin/notificationRules";
import n from "./AdminNotifications.module.css";

export const ADMIN_NOTIFICATIONS_EVENT = "finbyn:admin-notifications";

/**
 * The admin header bell: the session administrator's TOTAL authorized unread count (never category-filtered), capped visually at 99+. It reads once on load, on navigation, when the window
 * regains focus and when the inbox page changes something: no polling, no sockets. It is hidden when the administrator may not read notifications (any non-200 answer) and it never
 * writes anything.
 */
export function AdminBell() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications?count=1", { cache: "no-store", credentials: "same-origin" });
      const json = res.ok ? await res.json() : null;
      setCount(json?.ok ? Number(json.data.unreadCount) : null);
    } catch { /* keep the last known value */ }
  }, []);
  useEffect(() => { void read(); }, [read, pathname]);
  useEffect(() => {
    const on = () => void read();
    window.addEventListener("focus", on);
    window.addEventListener(ADMIN_NOTIFICATIONS_EVENT, on);
    return () => { window.removeEventListener("focus", on); window.removeEventListener(ADMIN_NOTIFICATIONS_EVENT, on); };
  }, [read]);
  if (count === null) return null;
  return (
    <Link href="/admin/notifications" className={n.bell} aria-label={count > 0 ? `Notifications, ${count > 99 ? "more than 99" : count} unread` : "Notifications, none unread"}>
      <Bell size={22} aria-hidden />
      {count > 0 && <span className={n.count} aria-hidden>{badgeText(count)}</span>}
    </Link>
  );
}
