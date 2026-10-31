"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  validateSupplierRegistration,
  type SupplierRegistrationErrors,
  type SupplierRegistrationValues,
} from "@/lib/validations/account";
import { registerSupplier } from "@/lib/api/account";
import styles from "./AccountForm.module.css";

const INITIAL: SupplierRegistrationValues = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  offering: "",
  password: "",
};

export function RegisterSupplierForm() {
  const router = useRouter();
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<SupplierRegistrationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function update(field: keyof SupplierRegistrationValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validateSupplierRegistration(values);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const result = await registerSupplier(values);
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
      <div className={styles.row}>
        <Input
          label="Business name"
          value={values.businessName}
          onChange={(event) => update("businessName", event.target.value)}
          error={errors.businessName}
        />
        <Input
          label="Contact person"
          autoComplete="name"
          value={values.contactName}
          onChange={(event) => update("contactName", event.target.value)}
          error={errors.contactName}
        />
      </div>
      <div className={styles.row}>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          error={errors.email}
        />
        <Input
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => update("phone", event.target.value)}
          error={errors.phone}
        />
      </div>
      <Input
        label="City"
        autoComplete="address-level2"
        value={values.city}
        onChange={(event) => update("city", event.target.value)}
        error={errors.city}
      />
      <Input
        label="Password (8+ characters)"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => update("password", event.target.value)}
        error={errors.password}
      />
      <label className={styles.field}>
        <span className={styles.label}>What do you supply?</span>
        <textarea
          className={styles.textarea}
          value={values.offering}
          onChange={(event) => update("offering", event.target.value)}
          aria-invalid={Boolean(errors.offering)}
        />
        {errors.offering && (
          <span className={styles.error} role="alert">
            {errors.offering}
          </span>
        )}
      </label>
      <Button type="submit" disabled={submitting}>
        <Send size={16} strokeWidth={2} aria-hidden />
        {submitting ? "Creating account..." : "Register as Supplier"}
      </Button>
      {message && (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
