"use client";

import { FormEvent, useState } from "react";
import clsx from "clsx";
import { KeyRound, Lock } from "lucide-react";
import { checkBuyerPassword } from "@/lib/auth/buyerRegistration";
import type { SecurityDto } from "@/lib/buyer/profile";
import { PasswordField } from "@/components/auth/PasswordField";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Not recorded");

/** Change password uses the one shared route and policy. Sessions: only what really exists is shown. */
export function SecurityPanel({ security }: { security: SecurityDto }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBanner(null);
    const found: Record<string, string> = {};
    if (!current) found.currentPassword = "Enter your current password.";
    const problem = checkBuyerPassword(next);
    if (problem) found.newPassword = problem;
    if (confirm !== next || !confirm) found.confirmPassword = confirm ? "Your passwords do not match." : "Re-enter your new password.";
    if (!found.newPassword && next === current) found.newPassword = "Choose a password different from your current one.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setBanner({ ok: true, text: data.message });
      return;
    }
    const fieldErrors: Record<string, string> = data.fields ?? {};
    setErrors(fieldErrors);
    setBanner({ ok: false, text: res ? (data.message ?? "The password could not be changed.") : "Could not reach the server. Nothing was changed." });
  }

  return (
    <section className={dash.card} aria-labelledby="security-title">
      <h2 id="security-title" className={dash.cardTitle}><Lock size={20} aria-hidden /> Security</h2>
      <ul className={dash.statusList}>
        <li className={dash.statusRow}><span>Account</span><span className={security.accountStatus === "ACTIVE" ? dash.badgeOk : dash.badgeWarn}>{security.accountStatus === "ACTIVE" ? "Active" : security.accountStatus}</span></li>
        <li className={dash.statusRow}><span>Email</span><span className={security.emailVerified ? dash.badgeOk : dash.badgeWarn}>{security.emailVerified ? "Confirmed" : "Not confirmed"}</span></li>
        <li className={dash.statusRow}><span>Mobile</span><span className={security.phoneVerified ? dash.badgeOk : dash.badgeWarn}>{security.phoneVerified ? "Confirmed" : "Not confirmed"}</span></li>
        <li className={dash.statusRow}><span>Last sign-in</span><span>{when(security.lastLoginAt)}</span></li>
        <li className={dash.statusRow}><span>Password last changed</span><span>{when(security.passwordChangedAt)}</span></li>
      </ul>
      <p className={dash.legendNote}>{security.sessions.reason}</p>

      <h3 className={`${styles.verifyTitle} ${styles.sectionGap}`}>Change Password</h3>
      {banner && <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>{banner.text}</p>}
      <form onSubmit={submit} noValidate aria-label="Change password">
        <div className={styles.formGrid}>
          <div className={styles.span2}>
            <PasswordField label="Current Password" autoComplete="current-password" value={current} onChange={setCurrent} error={errors.currentPassword} />
          </div>
          <PasswordField label="New Password" autoComplete="new-password" value={next} onChange={setNext} error={errors.newPassword} meter hint="10 to 128 characters." />
          <PasswordField label="Confirm New Password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirmPassword} />
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            <KeyRound size={18} aria-hidden /> {busy ? "Changing..." : "Change Password"}
          </button>
        </div>
      </form>
    </section>
  );
}
