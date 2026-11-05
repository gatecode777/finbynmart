"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Info, Lock, Mail, MailCheck, MailWarning, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { postAuth } from "@/lib/api/auth";
import styles from "./Auth.module.css";

const EMAIL_PATTERN = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

/** Asks for the account email and requests a reset link, or a new confirmation link when `purpose` is "verify". */
export function EmailRequestForm({ purpose }: { purpose: "reset" | "verify" }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setResult(null);
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter a valid email address.");
    setError("");
    setBusy(true);
    const response = await postAuth(purpose === "reset" ? "/api/auth/forgot-password" : "/api/auth/resend-verification", { email });
    setBusy(false);
    if (response.fields?.email && response.fields.email !== "not_configured") return setError(response.fields.email);
    setResult({ ok: response.ok, text: response.message });
  }

  if (result?.ok) {
    return (
      <div className={styles.result} role="status">
        <span className={styles.resultIcon}>
          <MailCheck size={28} aria-hidden />
        </span>
        <p className={styles.subheading}>{result.text}</p>
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={id} className={styles.label}>
          Email Address <span aria-hidden>*</span>
        </label>
        <input id={id} className={clsx(styles.control, error && styles.invalid)} type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
        {error && (
          <span id={`${id}-error`} className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>
      <Button type="submit" disabled={busy}>
        <Send size={18} aria-hidden />
        {busy ? "Sending..." : purpose === "reset" ? "Send Reset Link" : "Send Confirmation Link"}
      </Button>
      {result && !result.ok && (
        <p className={clsx(styles.status, styles.statusError)} role="alert">
          {result.text}
        </p>
      )}
      <p className={styles.switch}>
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

/**
 * The page behind the emailed confirmation link. Opening the link does NOT use the token (mail scanners and link previews
 * open links and would burn it): the person presses the button, which sends the one POST that uses it.
 */
export function VerifyEmailFlow({ token }: { token: string }) {
  const [state, setState] = useState<"ready" | "busy" | "ok" | "invalid" | "missing" | "error">(token ? "ready" : "missing");

  async function confirm() {
    setState("busy");
    const result = await postAuth("/api/auth/verify-email", { token });
    setState(result.ok ? "ok" : result.fields?.token ? "invalid" : "error");
  }

  if (state === "ready" || state === "busy") {
    return (
      <div className={styles.result}>
        <span className={styles.resultIcon}>
          <MailCheck size={28} aria-hidden />
        </span>
        <h2 className={styles.heading}>Confirm your email</h2>
        <p className={styles.subheading}>Press the button to confirm this email address for your Finbyn Mart account.</p>
        <Button type="button" onClick={confirm} disabled={state === "busy"}>
          {state === "busy" ? "Confirming..." : "Confirm Email Address"}
        </Button>
      </div>
    );
  }
  return <VerifyEmailResult state={state} />;
}

function VerifyEmailResult({ state }: { state: "ok" | "invalid" | "missing" | "error" }) {
  if (state === "ok") {
    return (
      <div className={styles.result} role="status">
        <span className={styles.resultIcon}>
          <CheckCircle2 size={28} aria-hidden />
        </span>
        <h2 className={styles.heading}>Email confirmed</h2>
        <p className={styles.subheading}>Your email address is confirmed. You can sign in now.</p>
        <Link className={styles.link} href="/sign-in">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.result} role="alert">
      <span className={clsx(styles.resultIcon, styles.resultIconWarn)}>
        <MailWarning size={28} aria-hidden />
      </span>
      <h2 className={styles.heading}>{state === "error" ? "Confirmation unavailable" : "This link cannot be used"}</h2>
      <p className={styles.subheading}>
        {state === "error"
          ? "We could not confirm your email just now. Open the link again in a moment."
          : state === "missing"
            ? "This page needs the link from your confirmation email."
            : "The confirmation link is invalid, was already used, or has expired (links last 24 hours)."}
      </p>
      {state !== "error" && (
        <Link className={styles.link} href="/verify-email/resend">
          Send a new confirmation link
        </Link>
      )}
    </div>
  );
}

/**
 * Page 19. One field, one button. The answer is always the generic one, so the success state never says whether an account
 * exists or what kind it is. The resend button follows the server's cooldown (the server enforces it; the countdown only
 * mirrors it). Nothing about the address or the link is kept in browser storage.
 */
export function ForgotPasswordForm({ validMinutes, cooldownSeconds }: { validMinutes: number; cooldownSeconds: number }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ text: string } | null>(null);
  const [failure, setFailure] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function request(path: string) {
    if (busy) return;
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter a valid email address.");
    setError("");
    setFailure("");
    setBusy(true);
    const response = await postAuth(path, { email });
    setBusy(false);
    if (response.ok) {
      const seconds = typeof response.data.cooldownSeconds === "number" ? response.data.cooldownSeconds : cooldownSeconds;
      setSent({ text: response.message });
      setWait(seconds);
      return;
    }
    if (response.status === 429) {
      const retry = Number(response.data.retryAfter);
      setFailure(response.message || "Too many attempts. Please wait a moment and try again.");
      if (Number.isFinite(retry) && retry > 0 && retry <= 3600) setWait(retry);
      return;
    }
    if (response.fields?.email && response.fields.email !== "not_configured") return setError(response.fields.email);
    setFailure(response.message);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void request("/api/auth/forgot-password");
  }

  return (
    <div>
      <span className={styles.lockBadge}>{sent ? <MailCheck size={30} aria-hidden /> : <Lock size={30} aria-hidden />}</span>
      <h1 className={styles.heading}>{sent ? "Check Your Email" : "Forgot Password?"}</h1>
      {sent ? (
        <div className={styles.form} role="status">
          <p className={styles.subheading}>{sent.text}</p>
          <ol className={styles.steps}>
            <li>Check your inbox, and your spam folder.</li>
            <li>The link works once and is valid for {validMinutes} minutes.</li>
            <li>Open it to choose a new password.</li>
          </ol>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" disabled={busy || wait > 0} onClick={() => void request("/api/auth/forgot-password/resend")}>
              {busy ? "Sending..." : wait > 0 ? `Send again in ${wait}s` : "Send the link again"}
            </Button>
            <Link className={styles.link} href="/sign-in">
              Back to Sign In
            </Link>
          </div>
          {failure && (
            <p className={clsx(styles.status, styles.statusError)} role="alert">
              {failure}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className={styles.subheading}>Enter your registered email address and we will send a secure password-reset link if your account is eligible.</p>
          <form className={styles.form} onSubmit={submit} noValidate aria-label="Request a password reset link">
            <div className={styles.field}>
              <label htmlFor={id} className={styles.label}>
                Business Email <span aria-hidden>*</span>
              </label>
              <div className={styles.inputWithIcon}>
                <Mail size={18} className={styles.inputIcon} aria-hidden />
                <input id={id} data-field="email" className={clsx(styles.control, error && styles.invalid)} type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your registered email" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
              </div>
              {error && (
                <span id={`${id}-error`} className={styles.error} role="alert">
                  {error}
                </span>
              )}
            </div>
            <Button type="submit" disabled={busy || wait > 0}>
              <Send size={18} aria-hidden />
              {busy ? "Sending..." : wait > 0 ? `Try again in ${wait}s` : "Send Reset Link"}
            </Button>
            {failure && (
              <p className={clsx(styles.status, styles.statusError)} role="alert">
                {failure}
              </p>
            )}
            <p className={styles.infoBox}>
              <Info size={18} aria-hidden />
              <span>Please check your inbox (and spam folder) for the password reset email. The link will be valid for {validMinutes} minutes.</span>
            </p>
            <p className={styles.switch}>
              Remember your password?{" "}
              <Link className={styles.link} href="/sign-in">
                Sign In
              </Link>
            </p>
          </form>
        </>
      )}
    </div>
  );
}
