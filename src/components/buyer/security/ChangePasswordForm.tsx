"use client";

import { FormEvent, useState } from "react";
import clsx from "clsx";
import { KeyRound } from "lucide-react";
import { checkBuyerPassword } from "@/lib/auth/buyerRegistration";
import { PasswordField } from "@/components/auth/PasswordField";
import styles from "../profile/Profile.module.css";

/**
 * The change-password form, in ONE place (the profile page, the settings page and Account Security all use it). It posts to the single shared route
 * /api/auth/change-password, which verifies the current password on the server, applies the registration password policy, rate limits, retires this
 * browser's session id and signs the other devices out. The browser only mirrors the policy for instant feedback; passwords are never stored or logged.
 */
export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
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
      setErrors({});
      setBanner({ ok: true, text: data.message });
      onChanged?.();
      return;
    }
    const fieldErrors: Record<string, string> = data.fields ?? {};
    setErrors(fieldErrors);
    setBanner({ ok: false, text: res ? (res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : (data.message ?? "The password could not be changed.")) : "Could not reach the server. Nothing was changed." });
  }

  return (
    <>
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
    </>
  );
}
