"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  validateRequirementForm,
  type RequirementFormErrors,
  type RequirementFormValues,
} from "@/lib/validations/requirement";
import { submitRequirement } from "@/lib/api/requirements";
import styles from "./RequirementForm.module.css";

const initialValues: RequirementFormValues = {
  product: "",
  quantity: "",
  city: "",
};

export function RequirementForm() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<RequirementFormErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle"
  );
  const [statusMessage, setStatusMessage] = useState("");

  function updateField(field: keyof RequirementFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateRequirementForm(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setStatus("submitting");
    const result = await submitRequirement(values);

    if (result.status === "ok") {
      setStatus("ok");
      setStatusMessage("Your requirement has been submitted.");
      setValues(initialValues);
    } else {
      setStatus("error");
      setStatusMessage(result.message);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Input
        label="Product / service name"
        hideLabel
        placeholder="Enter product / service name..."
        value={values.product}
        onChange={(event) => updateField("product", event.target.value)}
        error={errors.product}
      />
      <Input
        label="Quantity"
        hideLabel
        placeholder="Quantity"
        inputMode="numeric"
        value={values.quantity}
        onChange={(event) => updateField("quantity", event.target.value)}
        error={errors.quantity}
      />
      <Input
        label="City"
        hideLabel
        placeholder="Enter your city"
        value={values.city}
        onChange={(event) => updateField("city", event.target.value)}
        error={errors.city}
      />
      <Button type="submit" className={styles.submit} disabled={status === "submitting"}>
        <Send size={16} strokeWidth={2} aria-hidden />
        {status === "submitting" ? "Submitting..." : "Submit Requirement"}
      </Button>

      {statusMessage && (
        <p
          className={`${styles.status} ${status === "ok" ? styles.statusOk : styles.statusError}`}
          role="status"
        >
          {statusMessage}
        </p>
      )}
    </form>
  );
}
