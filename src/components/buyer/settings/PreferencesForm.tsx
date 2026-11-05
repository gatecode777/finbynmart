"use client";

import { FormEvent, useState } from "react";
import clsx from "clsx";
import { Bell, CalendarRange } from "lucide-react";
import { DASHBOARD_RANGES, NOTIFICATION_CATEGORIES, REQUIRED_CATEGORIES, type DashboardRange } from "@/lib/buyer/settingsRules";
import type { SettingsDto } from "@/lib/buyer/settings";
import dash from "../Dashboard.module.css";
import profile from "../profile/Profile.module.css";
import { useDirty } from "../profile/dirty";
import styles from "./Settings.module.css";

/**
 * The preferences that take effect: which in-app notification categories are created (applied where a notice is created, on the
 * server) and the dashboard period used when the address names none. A change is shown as saved only after the server answered.
 */
export function PreferencesForm({ initial }: { initial: SettingsDto }) {
  const [saved, setSaved] = useState(initial);
  const [inquiries, setInquiries] = useState(initial.notifications.inquiries);
  const [company, setCompany] = useState(initial.notifications.company);
  const [range, setRange] = useState<DashboardRange>(initial.dashboardRange);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const { setDirty } = useDirty();

  const changed = inquiries !== saved.notifications.inquiries || company !== saved.notifications.company || range !== saved.dashboardRange;
  const mark = (fn: () => void) => {
    fn();
    setBanner(null);
    setDirty(true);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setBanner(null);
    const res = await fetch("/api/buyer/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifications: { inquiries, company }, dashboardRange: range, version: saved.version }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) {
      const next = data.data.settings as SettingsDto;
      setSaved(next);
      setErrors({});
      setDirty(false);
      setBanner({ ok: true, text: data.message });
      return;
    }
    setErrors(data.fields ?? {});
    setBanner({ ok: false, text: res ? (data.message ?? "The settings could not be saved.") : "Could not reach the server. Nothing was saved." });
  }

  const values: Record<string, [boolean, (v: boolean) => void]> = { inquiries: [inquiries, setInquiries], company: [company, setCompany] };

  return (
    <form onSubmit={submit} noValidate aria-label="Preferences">
      <section className={dash.card} aria-labelledby="notif-pref-title">
        <h2 id="notif-pref-title" className={dash.cardTitle}><Bell size={20} aria-hidden /> Notification preferences</h2>
        <p className={styles.sectionIntro}>Choose which notifications appear in your Notifications list on this site. Email, SMS and WhatsApp messages are not sent yet, so there is nothing to set for them.</p>
        {banner && <p className={clsx(profile.banner, banner.ok ? profile.bannerOk : profile.bannerError)} role={banner.ok ? "status" : "alert"}>{banner.text}</p>}
        <ul className={styles.switchList}>
          {NOTIFICATION_CATEGORIES.map((c) => {
            const required = REQUIRED_CATEGORIES.includes(c.value);
            const [on, set] = values[c.value] ?? [true, () => undefined];
            const id = `pref-${c.value}`;
            return (
              <li key={c.value} className={styles.switchRow}>
                <span className={styles.switchText}>
                  <span className={styles.switchLabel}>{c.label}</span>
                  <span className={styles.switchHint} id={`${id}-hint`}>{c.description}</span>
                </span>
                <label className={clsx(styles.switchControl, required && styles.switchControlLocked)} htmlFor={id}>
                  <input id={id} type="checkbox" checked={required ? true : on} disabled={required} aria-describedby={`${id}-hint`} onChange={(e) => mark(() => set(e.target.checked))} />
                  {required ? "Always on" : on ? "On" : "Off"}
                </label>
              </li>
            );
          })}
        </ul>
        {(errors["notifications.inquiries"] || errors["notifications.company"]) && <p className={styles.fieldHint} role="alert">{errors["notifications.inquiries"] ?? errors["notifications.company"]}</p>}
      </section>

      <section className={clsx(dash.card, profile.sectionGap)} aria-labelledby="display-title">
        <h2 id="display-title" className={dash.cardTitle}><CalendarRange size={20} aria-hidden /> Display and regional</h2>
        <label htmlFor="pref-range" className={styles.fieldLabel}>Dashboard period</label>
        <select id="pref-range" className={styles.select} value={range} onChange={(e) => mark(() => setRange(e.target.value as DashboardRange))} aria-invalid={Boolean(errors.dashboardRange)} aria-describedby="pref-range-hint">
          {DASHBOARD_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <p className={styles.fieldHint} id="pref-range-hint">The period your Buyer Dashboard opens with. A period chosen on the dashboard itself always wins.</p>
        {errors.dashboardRange && <p className={styles.fieldHint} role="alert">{errors.dashboardRange}</p>}
        <ul className={styles.unavailableList}>
          <li className={styles.unavailableRow}><span className={styles.unavailableName}>Language</span><span className={styles.unavailableReason}>English only. No other language is implemented.</span><span className={styles.notYet}>Fixed</span></li>
          <li className={styles.unavailableRow}><span className={styles.unavailableName}>Timezone</span><span className={styles.unavailableReason}>India time (Asia/Kolkata). Every date and range on the site uses it.</span><span className={styles.notYet}>Fixed</span></li>
          <li className={styles.unavailableRow}><span className={styles.unavailableName}>Currency</span><span className={styles.unavailableReason}>Indian rupees. No other currency or exchange rate exists.</span><span className={styles.notYet}>Fixed</span></li>
        </ul>
      </section>

      <div className={profile.actions}>
        <button type="submit" className={profile.primaryButton} disabled={busy || !changed}>{busy ? "Saving..." : "Save Preferences"}</button>
      </div>
      {changed && <p className={profile.dirty}>You have unsaved changes.</p>}
    </form>
  );
}
