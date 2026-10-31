"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { validateSignUp, type SignUpErrors, type SignUpValues } from "@/lib/validations/account";
import { signUp } from "@/lib/api/account";
import styles from "./AccountForm.module.css";

export function SignUpForm() {
  const router = useRouter();
  const [values, setValues] = useState<SignUpValues>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function update(field: keyof SignUpValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validateSignUp(values);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const result = await signUp(values);
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
        label="Full name"
        autoComplete="name"
        value={values.name}
        onChange={(event) => update("name", event.target.value)}
        error={errors.name}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => update("email", event.target.value)}
        error={errors.email}
      />
      <Input
        label="Password (8+ characters)"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => update("password", event.target.value)}
        error={errors.password}
      />
      <Button type="submit" disabled={submitting}>
        <UserPlus size={16} strokeWidth={2} aria-hidden />
        {submitting ? "Creating account..." : "Create Account"}
      </Button>
      {message && (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
