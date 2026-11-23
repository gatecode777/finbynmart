"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { ChangePasswordForm } from "@/components/buyer/security/ChangePasswordForm";
import { announceAuthChange, flashToast } from "@/components/ui/Toast";
import { PREFERENCE_NOTES } from "@/lib/admin/settingsRules";
import type { NotificationCategory } from "@/lib/admin/notifications";
import type { AdminAccount } from "@/lib/admin/settings";
import { ADMIN_NOTIFICATIONS_EVENT } from "./AdminBell";
import s from "./AdminSettings.module.css";

type Tab = "account" | "security";
async function send(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: { message?: string; fields?: Record<string, string>; data?: Record<string, unknown> } | null }> {
  try {
    const res = await fetch(path, { method: "PATCH", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}
const expired = (status: number) => status === 401;

/**
 * The administrator's own settings. Sections save independently and nothing is optimistic: "saved" is shown only after the server confirmed it, a failed save keeps what was typed or switched,
 * Cancel restores the last saved values (never overwrites the server), and a second submit is blocked while one is pending. The e-mail and role are read-only and explained.
 */
export function AdminSettingsWorkspace({ account, categories, canPrefs, initialTab }: { account: AdminAccount; categories: NotificationCategory[]; canPrefs: boolean; initialTab: Tab }) {
  const uid = useId();
  const [tab, setTab] = useState<Tab>(initialTab);
  // account section
  const [savedName, setSavedName] = useState(account.name);
  const [name, setName] = useState(account.name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [nameMsg, setNameMsg] = useState("");
  const nameLock = useRef(false);
  // notification preferences
  const [saved, setSaved] = useState<string[]>(categories.filter((c) => c.enabled).map((c) => c.key));
  const [on, setOn] = useState<string[]>(saved);
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefMsg, setPrefMsg] = useState("");
  const prefLock = useRef(false);
  const [announce, setAnnounce] = useState("");

  const nameDirty = name.trim() !== savedName;
  const prefDirty = on.slice().sort().join() !== saved.slice().sort().join();

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (nameLock.current || !nameDirty) return;
    nameLock.current = true; setNameBusy(true); setNameErrors({}); setNameMsg("");
    const r = await send("/api/admin/settings/profile", { name });
    nameLock.current = false; setNameBusy(false);
    if (r.ok && r.json?.data) {
      const saved = String(r.json.data.name);
      setSavedName(saved); setName(saved);
      flashToast("success", String(r.json.message ?? "Saved."));
      setAnnounce("Your display name was saved.");
      announceAuthChange(); // the header reads the account again
      return;
    }
    if (expired(r.status)) setNameMsg("Your session has expired. Sign in again to save your changes (what you typed is still here).");
    else if (r.status === 422 && r.json?.fields) setNameErrors(r.json.fields);
    else setNameMsg(r.json?.message ?? (r.status === 403 ? "You do not have permission to change this." : r.status ? "Your display name could not be saved. Nothing was changed." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved.");
  }

  async function savePrefs() {
    if (prefLock.current || !prefDirty) return;
    prefLock.current = true; setPrefBusy(true); setPrefMsg("");
    const r = await send("/api/admin/settings/notifications", { categories: on });
    prefLock.current = false; setPrefBusy(false);
    if (r.ok && r.json?.data) {
      const now = (r.json.data.categories as NotificationCategory[]).filter((c) => c.enabled).map((c) => c.key);
      setSaved(now); setOn(now);
      flashToast("success", String(r.json.message ?? "Saved."));
      setAnnounce("Your notification preferences were saved.");
      window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_EVENT));
      return;
    }
    setPrefMsg(expired(r.status) ? "Your session has expired. Sign in again to save (your switches are unchanged)." : r.status === 403 ? "You do not have permission to change this." : r.json?.fields?.categories ?? r.json?.message ?? (r.status ? "Your preferences could not be saved. Nothing was changed." : "Network error. Nothing was saved."));
    flashToast("error", "Not saved.");
  }

  const tabs: { key: Tab; label: string }[] = [{ key: "account", label: "Account" }, { key: "security", label: "Security" }];
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); setTab(tabs[to].key); document.getElementById(`${uid}-tab-${tabs[to].key}`)?.focus();
  }
  const errList = Object.entries(nameErrors);

  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
      <div className={s.tabs} role="tablist" aria-label="Settings sections">
        {tabs.map((t, i) => <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`${uid}-panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={s.tab} onClick={() => setTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>)}
      </div>

      {tab === "account" && (
        <div role="tabpanel" id={`${uid}-panel-account`} aria-labelledby={`${uid}-tab-account`} className={s.grid}>
          <section className={s.card} aria-labelledby={`${uid}-acct`}>
            <h2 id={`${uid}-acct`}>Account details</h2>
            <form onSubmit={saveName} noValidate>
              {(errList.length > 0 || nameMsg) && <div className={s.summary} role="alert" tabIndex={-1}>{nameMsg || "Please fix the highlighted field."}{errList.map(([k, v]) => <p key={k} className={s.err}>{v}</p>)}</div>}
              <div className={s.field}>
                <label htmlFor={`${uid}-name`} className={s.lbl}>Display name</label>
                <input id={`${uid}-name`} className={s.input} value={name} maxLength={120} autoComplete="name" aria-invalid={nameErrors.name ? true : undefined} aria-describedby={nameErrors.name ? `${uid}-name-e` : `${uid}-name-h`} onChange={(e) => { setName(e.target.value); setNameErrors({}); setNameMsg(""); }} />
                <p id={`${uid}-name-h`} className={s.help}>Shown in the site header and in records you handle. It does not change your sign-in, role or permissions.</p>
                {nameErrors.name && <p id={`${uid}-name-e`} className={s.err}>{nameErrors.name}</p>}
              </div>
              <div className={s.field}>
                <label htmlFor={`${uid}-email`} className={s.lbl}>Email</label>
                <input id={`${uid}-email`} className={s.input} value={account.email || "Not provided"} readOnly aria-readonly="true" aria-describedby={`${uid}-email-h`} />
                <p id={`${uid}-email-h`} className={s.help}>This is your sign-in address. It cannot be changed here: a verified change-email process does not exist yet.</p>
              </div>
              <div className={s.field}>
                <label htmlFor={`${uid}-role`} className={s.lbl}>Role</label>
                <input id={`${uid}-role`} className={s.input} value={account.role} readOnly aria-readonly="true" aria-describedby={`${uid}-role-h`} />
                <p id={`${uid}-role-h`} className={s.help}>Permissions are managed separately and cannot be changed from this page.</p>
              </div>
              <div className={s.actions}>
                <button type="submit" className={prof.btnGold} disabled={nameBusy || !nameDirty}>{nameBusy ? "Saving…" : "Save Changes"}</button>
                <button type="button" className={prof.btnSecondary} disabled={nameBusy || !nameDirty} onClick={() => { setName(savedName); setNameErrors({}); setNameMsg(""); }}>Cancel</button>
                {nameDirty && !nameBusy && <span className={s.dirty}>You have unsaved changes.</span>}
              </div>
            </form>
          </section>

          <section className={s.card} aria-labelledby={`${uid}-np`}>
            <h2 id={`${uid}-np`}>Notification preferences</h2>
            {!canPrefs ? (
              <p className={s.help}>Notification preferences are not available: your account does not have access to notifications.</p>
            ) : categories.length === 0 ? (
              <p className={s.help}>There are no notification categories for the work you are authorized to review yet.</p>
            ) : (
              <>
                <p className={s.help}>Only in-app categories for work you are authorized to review are shown. These choices apply to your own inbox only.</p>
                {prefMsg && <p className={s.summary} role="alert">{prefMsg}</p>}
                <ul className={s.prefs}>
                  {categories.map((c) => {
                    const checked = on.includes(c.key);
                    return (
                      <li key={c.key} className={s.pref}>
                        <div className={s.prefText}>
                          <p className={s.prefTitle} id={`${uid}-p-${c.key}`}>{c.label}</p>
                          <p className={s.help} id={`${uid}-d-${c.key}`}>{c.description} {checked ? "Shown in your inbox." : "Hidden from your inbox."}</p>
                        </div>
                        <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${uid}-p-${c.key}`} aria-describedby={`${uid}-d-${c.key}`} className={s.switch} disabled={prefBusy} onClick={() => { setOn((cur) => (cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key])); setPrefMsg(""); }} />
                        <span className={s.state} aria-hidden>{checked ? "On" : "Off"}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className={s.actions}>
                  <button type="button" className={prof.btnGold} disabled={prefBusy || !prefDirty} onClick={savePrefs}>{prefBusy ? "Saving…" : "Save Preferences"}</button>
                  <button type="button" className={prof.btnSecondary} disabled={prefBusy || !prefDirty} onClick={() => { setOn(saved); setPrefMsg(""); }}>Cancel</button>
                  {prefDirty && !prefBusy && <span className={s.dirty}>You have unsaved changes.</span>}
                </div>
                <ul className={s.list} style={{ marginTop: "1rem" }}>{PREFERENCE_NOTES.map((n) => <li key={n}>{n}</li>)}</ul>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "security" && (
        <div role="tabpanel" id={`${uid}-panel-security`} aria-labelledby={`${uid}-tab-security`} className={s.grid}>
          <section className={s.card} aria-labelledby={`${uid}-pw`}>
            <h2 id={`${uid}-pw`}>Password</h2>
            <ChangePasswordForm />
          </section>
          <section className={s.card} aria-labelledby={`${uid}-sec`}>
            <h2 id={`${uid}-sec`}>Sign-in security</h2>
            <p className={s.help}>Changing your password signs you out of your other devices. If you cannot sign in, use <Link prefetch={false} href="/forgot-password" className={s.link}>Reset your password</Link>.</p>
            <p className={s.help} style={{ marginTop: ".75rem" }}>Session management and two-step verification are not available for administrator accounts yet, so no controls for them are shown.</p>
          </section>
        </div>
      )}
    </>
  );
}
