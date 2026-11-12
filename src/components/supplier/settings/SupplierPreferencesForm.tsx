"use client";

import { FormEvent, useState } from "react";
import { Bell, Info, Lock, Save } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import { CHANNELS, PREF_META, type SupplierNotificationSettings } from "@/lib/supplier/settingsRules";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "../profile/SupplierProfile.module.css";

export function SupplierPreferencesForm({ initial, revision: initialRevision }: { initial: SupplierNotificationSettings; revision: number }) {
  const [saved, setSaved] = useState(initial);
  const [settings, setSettings] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  const anyEditable = PREF_META.some((m) => m.available);
  const dirty = PREF_META.some((m) => settings[m.key] !== saved[m.key]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    setError("");
    setConflict(false);
    setBusy(true);
    const patch: Record<string, boolean> = {};
    for (const m of PREF_META) if (m.available && settings[m.key] !== saved[m.key]) patch[m.key] = settings[m.key];
    const res = await fetch("/api/supplier/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: revision, ...patch }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) {
      setSaved(data.data.settings);
      setSettings(data.data.settings);
      setRevision(data.data.revision);
      flashToast("success", "Preferences saved.");
      return;
    }
    const msg = res ? (data.message ?? "Could not save.") : "Network error. Nothing was saved; try again.";
    setConflict(res?.status === 409);
    setError(msg);
    flashToast("error", "Preferences not saved. " + msg);
  }

  return (
    <section className={dash.card} aria-labelledby="notification-settings-title">
      <h2 id="notification-settings-title" className={dash.cardTitle}>
        <Bell size={20} aria-hidden /> Notification preferences
      </h2>
      <p className={dash.legendNote}>These apply to your own account on every company you can access. Company-wide settings are not available yet.</p>

      <h3 style={{ fontSize: "0.9375rem", margin: "1rem 0 .5rem" }}>Delivery channels</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: ".4rem", fontSize: "0.875rem" }}>
        {CHANNELS.map((c) => (
          <li key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <span>{c.label}</span>
            <strong style={{ color: c.available ? "var(--primary, #04534f)" : "var(--text-secondary, #526563)" }}>{c.available ? "Available" : "Not available yet"}</strong>
          </li>
        ))}
      </ul>

      {error && (
        <p className={`${styles.banner} ${styles.bannerError}`} role="alert" style={{ marginTop: "1rem" }}>
          {error}{" "}
          {conflict && (
            <button type="button" className={styles.btnSecondary} onClick={() => window.location.reload()}>
              Reload latest
            </button>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.9375rem", margin: "0 0 .5rem" }}>Notices</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {PREF_META.map((m) => {
            const id = `pref-${m.key}`;
            return (
              <div key={m.key} style={{ display: "flex", gap: "12px", alignItems: "flex-start", opacity: m.available ? 1 : 0.75 }}>
                <input
                  id={id}
                  type="checkbox"
                  role="switch"
                  checked={settings[m.key]}
                  disabled={!m.available}
                  aria-describedby={`${id}-d`}
                  onChange={() => setSettings((c) => ({ ...c, [m.key]: !c[m.key] }))}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--primary, #04534f)" }}
                />
                <div>
                  <label htmlFor={id} style={{ display: "block", fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary, #183a38)" }}>
                    {m.label}
                  </label>
                  <span id={`${id}-d`} style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>
                    {m.available ? (
                      m.description
                    ) : (
                      <>
                        <Lock size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> {m.reason}
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className={dash.legendNote} style={{ marginTop: "1rem" }}>
          <Info size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Account and security notices are always shown in the bell when they occur and cannot be turned off. Turning a notice off never changes your inquiries, quotations or orders.
        </p>

        <div className={styles.actions} style={{ marginTop: "1.5rem" }}>
          <button type="submit" className={styles.btnPrimary} disabled={busy || !dirty || !anyEditable}>
            <Save size={16} aria-hidden /> {busy ? "Saving..." : "Save Preferences"}
          </button>
          {dirty && (
            <button type="button" className={styles.btnSecondary} onClick={() => { setSettings(saved); setError(""); }}>
              Discard changes
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
