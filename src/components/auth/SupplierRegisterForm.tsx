"use client";

import { FormEvent, ReactNode, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PHONE_COUNTRIES } from "@/lib/inquiries/rules";
import { validateSupplierSignup } from "@/lib/auth/supplierRegistration";
import { CONSENT_VERSION, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { postAuth } from "@/lib/api/auth";
import { PasswordField } from "./PasswordField";
import styles from "./Auth.module.css";

type Fields = "businessName" | "contactName" | "email" | "phone" | "city" | "offering" | "password" | "confirmPassword" | "consent";
const ORDER: Fields[] = ["businessName", "contactName", "email", "phone", "city", "offering", "password", "confirmPassword", "consent"];

export function SupplierRegisterForm() {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ businessName: "", contactName: "", email: "", countryCode: "+91", number: "", city: "", offering: "", password: "", confirmPassword: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState<{ email: string; failed: boolean } | null>(null);
  const [resend, setResend] = useState({ busy: false, text: "", ok: false });

  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const describe = (field: Fields) => (errors[field] ? `${id}-${field}-error` : undefined);
  const err = (field: Fields): ReactNode =>
    errors[field] ? (
      <span id={`${id}-${field}-error`} className={styles.error} role="alert">
        {errors[field]}
      </span>
    ) : null;

  const payload = () => ({
    businessName: values.businessName,
    contactName: values.contactName,
    email: values.email,
    phone: { countryCode: values.countryCode, number: values.number },
    city: values.city,
    offering: values.offering,
    password: values.password,
    confirmPassword: values.confirmPassword,
    consent,
    consentPolicyVersion: CONSENT_VERSION,
  });

  function focusFirst(found: Record<string, string>) {
    const first = ORDER.find((field) => found[field]);
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    const checked = validateSupplierSignup(payload());
    if (!checked.ok) {
      setErrors(checked.fields);
      focusFirst(checked.fields);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await postAuth("/api/auth/register/supplier", payload());
    if (result.ok) {
      if (result.data.signedIn === true) {
        router.push("/");
        router.refresh();
        return;
      }
      setSentTo({ email: checked.value.email, failed: result.data.verification === "email_failed" });
      setBusy(false);
      return;
    }
    setErrors(result.fields ?? {});
    setMessage(result.message);
    if (result.fields) focusFirst(result.fields);
    setBusy(false);
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
              Your supplier account for <strong>{sentTo.email}</strong> was created, but the confirmation email could not be sent just now. Request a new link below.
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
          <Link className={styles.link} href="/sign-in">
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
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="Create your supplier account">
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor={`${id}-business`} className={styles.label}>
            Business Name <span aria-hidden>*</span>
          </label>
          <input id={`${id}-business`} data-field="businessName" className={clsx(styles.control, errors.businessName && styles.invalid)} value={values.businessName} onChange={(event) => set("businessName")(event.target.value)} placeholder="Enter your business name" autoComplete="organization" maxLength={160} aria-invalid={Boolean(errors.businessName)} aria-describedby={describe("businessName")} />
          {err("businessName")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-contact`} className={styles.label}>
            Contact Person <span aria-hidden>*</span>
          </label>
          <input id={`${id}-contact`} data-field="contactName" className={clsx(styles.control, errors.contactName && styles.invalid)} value={values.contactName} onChange={(event) => set("contactName")(event.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.contactName)} aria-describedby={describe("contactName")} />
          {err("contactName")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-email`} className={styles.label}>
            Business Email <span aria-hidden>*</span>
          </label>
          <input id={`${id}-email`} data-field="email" className={clsx(styles.control, errors.email && styles.invalid)} type="email" inputMode="email" value={values.email} onChange={(event) => set("email")(event.target.value)} placeholder="you@company.com" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} />
          {err("email")}
          {errors.email?.includes("already registered") && (
            <Link className={styles.link} href="/sign-in">
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
          <label htmlFor={`${id}-city`} className={styles.label}>
            City <span aria-hidden>*</span>
          </label>
          <input id={`${id}-city`} data-field="city" className={clsx(styles.control, errors.city && styles.invalid)} value={values.city} onChange={(event) => set("city")(event.target.value)} placeholder="Enter your city" autoComplete="address-level2" maxLength={80} aria-invalid={Boolean(errors.city)} aria-describedby={describe("city")} />
          {err("city")}
        </div>
        <div className={clsx(styles.field, styles.span2)}>
          <label htmlFor={`${id}-offering`} className={styles.label}>
            What Do You Supply? <span aria-hidden>*</span>
          </label>
          <textarea id={`${id}-offering`} data-field="offering" className={clsx(styles.control, styles.textarea, errors.offering && styles.invalid)} rows={4} maxLength={500} value={values.offering} onChange={(event) => set("offering")(event.target.value)} placeholder="Products or services you supply" aria-invalid={Boolean(errors.offering)} aria-describedby={describe("offering")} />
          <span className={styles.hint}>{values.offering.length} / 500. Saved as you type it. It is not verified by Finbyn Mart.</span>
          {err("offering")}
        </div>
        <div className={styles.field}>
          <PasswordField field="password" label="Password" autoComplete="new-password" value={values.password} onChange={set("password")} error={errors.password} meter hint="10 to 128 characters." />
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

      <Button type="submit" disabled={busy}>
        <Send size={18} aria-hidden />
        {busy ? "Creating account..." : "Register as Supplier"}
      </Button>
      {message && (
        <p className={clsx(styles.status, styles.statusError)} role="alert">
          {message}
        </p>
      )}
      <p className={styles.switch}>
        Already have an account?{" "}
        <Link className={styles.link} href="/sign-in">
          Sign in
        </Link>
        {" · "}
        Buying instead?{" "}
        <Link className={styles.link} href="/register/buyer">
          Create a buyer account
        </Link>
      </p>
    </form>
  );
}
