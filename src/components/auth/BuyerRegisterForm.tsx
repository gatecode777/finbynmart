"use client";

import { FormEvent, ReactNode, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { MailCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PHONE_COUNTRIES, validateBuyerRegistration } from "@/lib/auth/buyerRegistration";
import { CONSENT_VERSION, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { postAuth } from "@/lib/api/auth";
import { PasswordField } from "./PasswordField";
import styles from "./Auth.module.css";

type Fields = "name" | "email" | "phone" | "companyName" | "password" | "confirmPassword" | "consent";

/** `next` is a path on this site (checked by the page); a buyer who is signed in straight away goes there. */
export function BuyerRegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ name: "", email: "", countryCode: "+91", number: "", companyName: "", password: "", confirmPassword: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState<{ email: string; failed: boolean } | null>(null);
  const [resend, setResend] = useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: "", ok: false });

  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const describe = (field: Fields) => (errors[field] ? `${id}-${field}-error` : undefined);
  const err = (field: Fields): ReactNode =>
    errors[field] ? (
      <span id={`${id}-${field}-error`} className={styles.error} role="alert">
        {errors[field]}
      </span>
    ) : null;

  function payload() {
    return {
      name: values.name,
      email: values.email,
      phone: { countryCode: values.countryCode, number: values.number },
      companyName: values.companyName,
      password: values.password,
      confirmPassword: values.confirmPassword,
      consent,
      consentPolicyVersion: CONSENT_VERSION,
    };
  }

  function focusFirstError(found: Record<string, string>) {
    const order: Fields[] = ["name", "email", "phone", "companyName", "password", "confirmPassword", "consent"];
    const first = order.find((field) => found[field]);
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage("");
    const checked = validateBuyerRegistration(payload());
    if (!checked.ok) {
      setErrors(checked.fields);
      focusFirstError(checked.fields);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await postAuth("/api/auth/register/buyer", payload());
    if (result.ok) {
      if (result.data.signedIn === true) {
        router.push(next ?? "/");
        router.refresh();
        return;
      }
      setSentTo({ email: checked.value.email, failed: result.data.verification === "email_failed" });
      setSubmitting(false);
      return;
    }
    setErrors(result.fields ?? {});
    setMessage(result.message);
    if (result.fields) focusFirstError(result.fields);
    setSubmitting(false);
  }

  async function resendLink() {
    if (!sentTo || resend.busy) return;
    setResend({ busy: true, text: "", ok: false });
    const result = await postAuth("/api/auth/resend-verification", { email: sentTo.email });
    setResend({ busy: false, text: result.message, ok: result.ok });
  }

  if (sentTo) {
    return (
      <div className={styles.result} role="status">
        <span className={styles.resultIcon}>
          <MailCheck size={28} aria-hidden />
        </span>
        <h2 className={styles.heading}>{sentTo.failed ? "Account created" : "Check your email"}</h2>
        <p className={styles.subheading}>
          {sentTo.failed ? (
            <>
              Your account for <strong>{sentTo.email}</strong> was created, but we could not send the confirmation email just now. Request a new link below.
            </>
          ) : (
            <>
              We sent a confirmation link to <strong>{sentTo.email}</strong>. Open it to activate your account, then sign in. The link works once and expires in 24 hours.
            </>
          )}
        </p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={resendLink} disabled={resend.busy}>
            {resend.busy ? "Sending..." : "Send a new link"}
          </Button>
          <Link className={styles.link} href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>
            Go to sign in
          </Link>
        </div>
        {resend.text && (
          <p className={clsx(styles.status, resend.ok ? styles.statusOk : styles.statusError)} role="alert">
            {resend.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="Create your buyer account">
      <div className={styles.grid}>
        <div className={clsx(styles.field, styles.span2)}>
          <label htmlFor={`${id}-name`} className={styles.label}>
            Full Name <span aria-hidden>*</span>
          </label>
          <input id={`${id}-name`} data-field="name" className={clsx(styles.control, errors.name && styles.invalid)} value={values.name} onChange={(event) => set("name")(event.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} />
          {err("name")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-email`} className={styles.label}>
            Business Email <span aria-hidden>*</span>
          </label>
          <input id={`${id}-email`} data-field="email" className={clsx(styles.control, errors.email && styles.invalid)} type="email" inputMode="email" value={values.email} onChange={(event) => set("email")(event.target.value)} placeholder="you@company.com" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} />
          {err("email")}
          {errors.email?.includes("already registered") && (
            <Link className={styles.link} href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>
              Sign in to your account
            </Link>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-phone`} className={styles.label}>
            Mobile Number <span aria-hidden>*</span>
          </label>
          <div className={clsx(styles.phone, errors.phone && styles.invalid)}>
            <select aria-label="Country code" className={styles.dial} value={values.countryCode} onChange={(event) => set("countryCode")(event.target.value)}>
              {PHONE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.code}
                </option>
              ))}
            </select>
            <input id={`${id}-phone`} data-field="phone" className={styles.phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" value={values.number} onChange={(event) => set("number")(event.target.value)} placeholder="Enter mobile number" aria-invalid={Boolean(errors.phone)} aria-describedby={describe("phone")} />
          </div>
          {err("phone")}
        </div>
        <div className={clsx(styles.field, styles.span2)}>
          <label htmlFor={`${id}-company`} className={styles.label}>
            Company Name <span aria-hidden>*</span>
          </label>
          <input id={`${id}-company`} data-field="companyName" className={clsx(styles.control, errors.companyName && styles.invalid)} value={values.companyName} onChange={(event) => set("companyName")(event.target.value)} placeholder="Enter your company name" autoComplete="organization" maxLength={160} aria-invalid={Boolean(errors.companyName)} aria-describedby={describe("companyName")} />
          {err("companyName")}
          <span className={styles.hint}>Saved as you type it. It is not verified by Finbyn Mart.</span>
        </div>
        <div className={styles.field}>
          <PasswordField field="password" label="Password" autoComplete="new-password" value={values.password} onChange={set("password")} error={errors.password} meter hint="10 to 128 characters. A longer phrase is stronger than a short, complicated one." />
        </div>
        <div className={styles.field}>
          <PasswordField field="confirmPassword" label="Confirm Password" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />
        </div>
      </div>

      <div className={styles.consent}>
        <label className={styles.consentLabel}>
          <input data-field="consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={describe("consent")} />
          <span>
            I agree to the{" "}
            <Link href={TERMS_PATH} target="_blank" rel="noopener noreferrer">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href={PRIVACY_PATH} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            . <span aria-hidden>*</span>
          </span>
        </label>
        {err("consent")}
      </div>

      <Button type="submit" disabled={submitting}>
        <UserPlus size={18} aria-hidden />
        {submitting ? "Creating account..." : "Create Buyer Account"}
      </Button>
      {message && (
        <p className={clsx(styles.status, styles.statusError)} role="alert">
          {message}
        </p>
      )}
      <p className={styles.switch}>
        Already have an account?{" "}
        <Link className={styles.link} href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>
          Sign in
        </Link>
        {" · "}
        Selling instead?{" "}
        <Link className={styles.link} href="/register-supplier">
          Register as a supplier
        </Link>
      </p>
    </form>
  );
}
