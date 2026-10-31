"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { validateSignIn, type SignInErrors, type SignInValues } from "@/lib/validations/account";
import { signIn } from "@/lib/api/account";
import styles from "./AccountForm.module.css";

export function SignInForm() {
  const router = useRouter();
  const [values, setValues] = useState<SignInValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<SignInErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validateSignIn(values);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const result = await signIn(values);
    if (result.status === "ok") {
      router.push("/");
      router.refresh();
      return;
    }
    setErrors(result.fields ?? {});
    setMessage(result.message);
    setSubmitting(false);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
        error={errors.email}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
        error={errors.password}
      />
      <Button type="submit" disabled={submitting}>
        <LogIn size={16} strokeWidth={2} aria-hidden />
        {submitting ? "Signing in..." : "Sign In"}
      </Button>
      {message && (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
