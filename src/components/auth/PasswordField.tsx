"use client";

import { ReactNode, useId, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { passwordStrength } from "@/lib/auth/buyerRegistration";
import styles from "./Auth.module.css";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: "new-password" | "current-password";
  /** Shows the strength meter (new passwords only). The meter is guidance; the server rules decide. */
  meter?: boolean;
  hint?: string;
  placeholder?: string;
  /** Written to data-field so a form can move focus to the first invalid input. */
  field?: string;
  /** Optional icon shown inside the field on the left. */
  icon?: ReactNode;
}

export function PasswordField({ label, value, onChange, error, autoComplete, meter, hint, placeholder, field, icon }: PasswordFieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const strength = passwordStrength(value);
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : "", meter && value ? `${id}-meter` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label} <span aria-hidden>*</span>
      </label>
      <div className={styles.passwordWrap}>
        {icon && <span className={styles.inputIcon}>{icon}</span>}
        <input
          id={id}
          data-field={field}
          className={clsx(styles.control, icon && styles.controlIcon, error && styles.invalid)}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCapitalize="none"
        />
        <button type="button" className={styles.reveal} onClick={() => setShown((current) => !current)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
          {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {meter && value && (
        <div id={`${id}-meter`}>
          <div className={styles.meter} aria-hidden>
            {[1, 2, 3, 4].map((step) => (
              <span key={step} className={styles.meterBar} data-on={strength.score >= step} data-score={strength.score} />
            ))}
          </div>
          <span className={styles.meterLabel}>Password strength: {strength.label}</span>
        </div>
      )}
      {hint && !error && (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
