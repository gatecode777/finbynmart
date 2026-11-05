"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, CheckCircle2, Circle, KeyRound, Lock, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PASSWORD_RULES, checkBuyerPassword } from "@/lib/auth/buyerRegistration";
import { postAuth } from "@/lib/api/auth";
import { PasswordField } from "./PasswordField";
import styles from "./Auth.module.css";

/** What the server knew about the link when the page was built. "MISSING" and "UNAVAILABLE" are decided by the page. */
export type LinkState = "VALID" | "INVALID" | "EXPIRED" | "ALREADY_USED" | "REVOKED" | "MISSING" | "UNAVAILABLE";

const FAILURES: Record<Exclude<LinkState, "VALID">, { title: string; text: string; cta: { href: string; label: string } }> = {
  MISSING: { title: "Password reset link is incomplete", text: "Open the link from your password-reset email again, or request a new one.", cta: { href: "/forgot-password", label: "Request New Reset Link" } },
  INVALID: { title: "This reset link cannot be verified", text: "This password reset link is invalid. Please request a new link.", cta: { href: "/forgot-password", label: "Request New Reset Link" } },
  EXPIRED: { title: "This reset link has expired", text: "This password reset link has expired. Request a new link to continue.", cta: { href: "/forgot-password", label: "Request New Reset Link" } },
  ALREADY_USED: { title: "This reset link has already been used", text: "This password reset link has already been used. Please sign in or request a new link.", cta: { href: "/sign-in", label: "Go to Sign In" } },
  REVOKED: { title: "This reset link was replaced", text: "A newer reset link was sent after this one. Use the latest email, or request a new link.", cta: { href: "/forgot-password", label: "Request New Reset Link" } },
  UNAVAILABLE: { title: "Unable to verify this link right now", text: "We could not check this link just now. Please try again in a moment.", cta: { href: "", label: "Try Again" } },
};

/** The only page a finished reset may open. It shows success only if the server issued a confirmation (cookie), so the address alone proves nothing. */
const SUCCESS_PAGE = "/password-reset/success";

/**
 * Page 20. The token reaches this component as a prop and is held in memory only; once the page has loaded it is removed
 * from the address bar (history.replaceState) so it does not linger in the visible URL or the history entry. Nothing is
 * written to browser storage. Opening the page never uses the token: only the button's single POST does.
 */
export function ResetPasswordForm({ token, initialState }: { token: string; initialState: LinkState }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState<LinkState | null>(null);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const state: LinkState = failed ?? initialState;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    const problem = checkBuyerPassword(password);
    if (problem) found.password = problem;
    if (!confirm) found.confirmPassword = "Re-enter your password.";
    else if (confirm !== password) found.confirmPassword = "Your passwords do not match.";
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = await postAuth("/api/auth/reset-password", { token, password, confirmPassword: confirm });
    if (!result.ok) setBusy(false); // after success the button stays busy until the page changes, so it cannot be pressed twice
    if (result.ok) {
      setPassword("");
      setConfirm("");
      // the server set the confirmation cookie with this answer; the success page reads it, not this component
      router.replace(SUCCESS_PAGE);
      return;
    }
    const tokenState = result.fields?.token;
    if (tokenState && tokenState in FAILURES) return setFailed(tokenState as LinkState);
    setErrors(result.fields ?? {});
    setMessage(result.message);
  }

  if (state !== "VALID") {
    const view = FAILURES[state];
    return (
      <div className={styles.result} role="alert">
        <span className={clsx(styles.resultIcon, styles.resultIconWarn)}>
          <MailWarning size={28} aria-hidden />
        </span>
        <h1 className={styles.heading}>{view.title}</h1>
        <p className={styles.subheading}>{view.text}</p>
        {view.cta.href ? (
          <Link className={styles.linkButton} href={view.cta.href}>
            {view.cta.label}
          </Link>
        ) : (
          <Button type="button" onClick={() => window.location.reload()}>
            {view.cta.label}
          </Button>
        )}
      </div>
    );
  }

  const typed = password.length > 0;
  const matches = confirm.length > 0 && confirm === password;
  return (
    <div>
      <span className={styles.lockBadge}>
        <KeyRound size={30} aria-hidden />
      </span>
      <h1 className={styles.heading}>Reset Password</h1>
      <p className={styles.subheading}>Enter a new password for your Finbyn Mart account.</p>
      <form className={styles.form} onSubmit={submit} noValidate aria-label="Choose a new password">
        <PasswordField field="password" label="New Password" icon={<Lock size={18} aria-hidden />} autoComplete="new-password" placeholder="Create a new password" value={password} onChange={setPassword} error={errors.password} meter />
        <PasswordField field="confirmPassword" label="Confirm New Password" icon={<Lock size={18} aria-hidden />} autoComplete="new-password" placeholder="Re-enter password" value={confirm} onChange={setConfirm} error={errors.confirmPassword} />
        <div>
          <p className={styles.requirementsTitle} id="req-title">
            Password must meet the following requirements:
          </p>
          <ul className={styles.requirements} aria-labelledby="req-title" aria-live="polite">
            {[...PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, met: typed && rule.test(password) })), { id: "match", label: "Both passwords match", met: matches }].map((item) => (
              <li key={item.id} className={clsx(styles.requirement, item.met && styles.requirementMet)} data-met={item.met}>
                {item.met ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                <span>
                  {item.label}
                  <span className="visually-hidden">{item.met ? " (met)" : " (not met yet)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound size={18} aria-hidden />
          {busy ? "Resetting..." : "Reset Password"}
        </Button>
        {message && (
          <p className={clsx(styles.status, styles.statusError)} role="alert">
            {message}
          </p>
        )}
        <p className={styles.switch}>
          <Link className={`${styles.link} ${styles.backLink}`} href="/sign-in">
            <ArrowLeft size={16} aria-hidden /> Back to Sign In
          </Link>
        </p>
      </form>
    </div>
  );
}
