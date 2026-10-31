import { InputHTMLAttributes, useId } from "react";
import clsx from "clsx";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hideLabel?: boolean;
}

export function Input({
  label,
  error,
  hideLabel,
  id,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={styles.field}>
      {label && (
        <label
          htmlFor={inputId}
          className={clsx(styles.label, hideLabel && "visually-hidden")}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(styles.input, error && styles.invalid, className)}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...props}
      />
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
