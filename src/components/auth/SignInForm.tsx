"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { flashToast } from "@/components/ui/Toast";
import { validateSignIn } from "@/lib/validations/account";
import { signIn } from "@/lib/api/account";
import { PasswordField } from "./PasswordField";
import styles from "./Auth.module.css";

/** `next` is a path on this site (checked by the page); the buyer returns there after signing in. */
export function SignInForm({ next }: { next?: string }) {
  const id = useId();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = validateSignIn(values);
    setErrors(found);
    setMessage("");
    setUnverified(false);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    const result = await signIn(values);
    if (result.status === "ok") {
      // The server confirmed the sign-in (the session cookie is set). Show it at once, keep the form locked, and leave with a full
      // page load: it cannot be cancelled by a refresh, it shows the signed-in header from the first paint, and it works the same
      // when the next page is slow to build. The confirmation toast waits for that page (deferred) and is shown there.
      setSignedIn(true);
      flashToast("success", "You are signed in.", { deferred: true });
      window.location.assign(next ?? "/");
      return;
    }
    setErrors(result.fields ?? {});
    setMessage(result.message);
    setUnverified(result.code === "email_not_verified");
    setBusy(false);
  }

  const registerHref = next ? `/register/buyer?next=${encodeURIComponent(next)}` : "/register/buyer";
  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Sign in">
      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          Email Address <span aria-hidden>*</span>
        </label>
        <input id={`${id}-email`} className={clsx(styles.control, errors.email && styles.invalid)} type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))} placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-error` : undefined} />
        {errors.email && (
          <span id={`${id}-email-error`} className={styles.error} role="alert">
            {errors.email}
          </span>
        )}
      </div>
      <PasswordField label="Password" autoComplete="current-password" value={values.password} onChange={(password) => setValues((prev) => ({ ...prev, password }))} error={errors.password} />
      <Link href="/forgot-password" className={styles.forgot}>
        Forgot password?
      </Link>
      <Button type="submit" disabled={busy}>
        <LogIn size={18} aria-hidden />
        {signedIn ? "Signed in. Taking you there..." : busy ? "Signing in..." : "Sign In"}
      </Button>
      {signedIn && (
        <p className={clsx(styles.status, styles.statusOk)} role="status">
          You are signed in. Taking you to your page...
        </p>
      )}
      {message && (
        <p className={clsx(styles.status, styles.statusError)} role="alert">
          {message}
          {unverified && (
            <>
              {" "}
              <Link className={styles.link} href="/verify-email/resend">
                Send a new confirmation link
              </Link>
            </>
          )}
        </p>
      )}
      <p className={styles.switch}>
        Don&apos;t have an account?{" "}
        <Link className={styles.link} href={registerHref}>
          Sign up as a buyer
        </Link>
        {" · "}
        <Link className={styles.link} href="/register-supplier">
          Register as a supplier
        </Link>
      </p>
    </form>
  );
}
