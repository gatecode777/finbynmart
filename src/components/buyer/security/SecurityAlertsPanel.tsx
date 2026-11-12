"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import type { AlertDto } from "@/lib/buyer/security";
import inq from "../inquiries/Inquiries.module.css";
import { usePagedFetch } from "../support/usePagedFetch";
import { Loading, StatusBadge } from "./securityShared";
import s from "./Security.module.css";

/**
 * Alerts raised for real events on this account (a first sign-in from a browser/OS, repeated failed sign-ins, a password change, a device signed out).
 * "Mark as seen" is saved on the server, and the list is read again after it. The notices are mandatory: there is nothing here to switch them off.
 */
export function SecurityAlertsPanel({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = usePagedFetch<AlertDto>(`/api/buyer/security/alerts?status=${filter}`, true, version, (b) => (b as { data: { alerts: AlertDto[] } }).data.alerts, "before");

  async function acknowledge(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/buyer/security/alerts/${id}/acknowledge`, { method: "PATCH" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : (body.message ?? "The alert could not be updated."));
      flashToast("success", "Marked as seen.");
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className={s.toolbar}>
        <label className="visually-hidden" htmlFor="alert-filter">Show alerts</label>
        <select id="alert-filter" className={s.select} value={filter} onChange={(e) => { setFilter(e.target.value as "all" | "open"); setVersion((v) => v + 1); }}>
          <option value="all">All alerts</option>
          <option value="open">Unseen only</option>
        </select>
      </div>
      {error && <p className={clsx(s.banner, s.bannerError)} role="alert">{error}</p>}
      {state.status === "idle" || state.status === "loading" ? (
        <Loading label="Loading alerts" />
      ) : state.status === "error" ? (
        <div role="alert">
          <p className={s.note}>Alerts could not be loaded. {state.error}</p>
          <button type="button" className={inq.btn} onClick={state.retry}>Try again</button>
        </div>
      ) : state.items.length === 0 ? (
        <p className={s.note}>{filter === "open" ? "No unseen security alerts." : "No security alerts have been raised for this account."}</p>
      ) : (
        <ul className={s.alerts} aria-label="Security alerts">
          {state.items.map((a) => (
            <li key={a.id} className={clsx(s.alert, a.severity === "warning" && !a.acknowledged && s.alertWarn)}>
              <div className={s.cardTop}>
                <p className={s.cardName}>{a.title}</p>
                <StatusBadge status={a.acknowledged ? "info" : a.severity === "warning" ? "warn" : "info"} label={a.acknowledged ? "Seen" : a.severity === "warning" ? "Needs attention" : "New"} />
              </div>
              <p className={inq.muted}>{a.summary}</p>
              <p className={inq.muted}>{a.recommended}</p>
              <p className={inq.muted}><time dateTime={a.createdAt}>{a.createdLabel}</time>{a.acknowledgedLabel ? ` · seen ${a.acknowledgedLabel}` : ""}</p>
              {!a.acknowledged && <div><button type="button" className={inq.btn} onClick={() => void acknowledge(a.id)} disabled={busy !== null}><Check size={16} aria-hidden /> {busy === a.id ? "Saving..." : "Mark as seen"}</button></div>}
            </li>
          ))}
        </ul>
      )}
      {state.hasMore && <p><button type="button" className={inq.btn} onClick={state.loadMore} disabled={state.loadingMore}>{state.loadingMore ? "Loading..." : "Show older alerts"}</button></p>}

      <h3 className={s.cardName} style={{ marginTop: "var(--space-5)" }}>What you are told about</h3>
      <ul className={s.intro} style={{ paddingLeft: "var(--space-5)" }}>
        <li>A sign-in from a browser and system this account has not used before.</li>
        <li>Repeated failed sign-in attempts in a short time.</li>
        <li>A password change, and devices being signed out.</li>
      </ul>
      <p className={s.note}>These notices are required for account safety and cannot be switched off. They appear here and in your notifications on this site. No email is sent for them, because security emails are not set up.</p>
    </div>
  );
}
