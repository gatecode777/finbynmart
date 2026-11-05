"use client";

import { FormEvent, ReactNode, useId, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PHONE_COUNTRIES } from "@/lib/inquiries/rules";
import { CONSENT_VERSION, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { SUPPORT_TOPICS, validateSupportRequest } from "@/lib/support/rules";
import { postAuth } from "@/lib/api/auth";
// the form controls are the same ones the account pages use
import styles from "@/components/auth/Auth.module.css";

type Fields = "name" | "email" | "phone" | "topic" | "message" | "consent";

export function ContactForm({ initialName = "", initialEmail = "" }: { initialName?: string; initialEmail?: string }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // one key per page load: pressing Send twice, or a retry after a dropped connection, saves one request
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}0000000`));
  const [values, setValues] = useState({ name: initialName, email: initialEmail, countryCode: "+91", number: "", topic: "", message: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<{ reference: string; text: string } | null>(null);

  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const describe = (field: Fields) => (errors[field] ? `${id}-${field}-error` : undefined);
  const err = (field: Fields): ReactNode =>
    errors[field] ? (
      <span id={`${id}-${field}-error`} className={styles.error} role="alert">
        {errors[field]}
      </span>
    ) : null;

  const payload = () => ({
    name: values.name,
    email: values.email,
    phone: { countryCode: values.countryCode, number: values.number },
    topic: values.topic,
    message: values.message,
    consent,
    consentPolicyVersion: CONSENT_VERSION,
    idempotencyKey,
  });

  function focusFirst(found: Record<string, string>) {
    const first = (["name", "email", "phone", "topic", "message", "consent"] as Fields[]).find((field) => found[field]);
    if (first) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    const checked = validateSupportRequest(payload());
    if (!checked.ok) {
      setErrors(checked.fields);
      focusFirst(checked.fields);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await postAuth("/api/support/requests", payload());
    setBusy(false);
    if (result.ok && typeof result.data.reference === "string") {
      setSaved({ reference: result.data.reference, text: result.message });
      return;
    }
    setErrors(result.fields ?? {});
    setMessage(result.message);
    if (result.fields) focusFirst(result.fields);
  }

  if (saved) {
    return (
      <div className={styles.result} role="status">
        <span className={styles.resultIcon}>
          <CheckCircle2 size={28} aria-hidden />
        </span>
        <h2 className={styles.heading}>Message saved</h2>
        <p className={styles.subheading}>{saved.text}</p>
        <p>
          Reference: <strong>{saved.reference}</strong>
        </p>
        <Link className={styles.link} href="/">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="Contact Finbyn Mart">
      <div className={styles.field}>
        <label htmlFor={`${id}-name`} className={styles.label}>
          Full Name <span aria-hidden>*</span>
        </label>
        <input id={`${id}-name`} data-field="name" className={clsx(styles.control, errors.name && styles.invalid)} value={values.name} onChange={(event) => set("name")(event.target.value)} autoComplete="name" placeholder="Enter your full name" aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} />
        {err("name")}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          Email Address <span aria-hidden>*</span>
        </label>
        <input id={`${id}-email`} data-field="email" className={clsx(styles.control, errors.email && styles.invalid)} type="email" inputMode="email" value={values.email} onChange={(event) => set("email")(event.target.value)} autoComplete="email" placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} />
        {err("email")}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-phone`} className={styles.label}>
          Phone Number (optional)
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
      <div className={styles.field}>
        <label htmlFor={`${id}-topic`} className={styles.label}>
          Topic <span aria-hidden>*</span>
        </label>
        <select id={`${id}-topic`} data-field="topic" className={clsx(styles.control, errors.topic && styles.invalid)} value={values.topic} onChange={(event) => set("topic")(event.target.value)} aria-invalid={Boolean(errors.topic)} aria-describedby={describe("topic")}>
          <option value="">Choose a topic</option>
          {SUPPORT_TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </select>
        {err("topic")}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-message`} className={styles.label}>
          Message <span aria-hidden>*</span>
        </label>
        <textarea id={`${id}-message`} data-field="message" className={clsx(styles.control, styles.textarea, errors.message && styles.invalid)} rows={6} maxLength={2000} value={values.message} onChange={(event) => set("message")(event.target.value)} placeholder="Tell us how we can help" aria-invalid={Boolean(errors.message)} aria-describedby={describe("message")} />
        <span className={styles.hint}>{values.message.length} / 2000</span>
        {err("message")}
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
        {busy ? "Sending..." : "Send Message"}
      </Button>
      {message && (
        <p className={clsx(styles.status, styles.statusError)} role="alert">
          {message}
        </p>
      )}
      <p className={styles.hint}>Your message is saved on our side and given a reference number. Nobody is notified by email yet, and a reply time cannot be promised.</p>
    </form>
  );
}
