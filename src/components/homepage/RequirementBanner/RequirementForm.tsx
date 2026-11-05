"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
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

interface RequirementFormProps {
  /** Prefills the product/service field (for example from a category page). */
  defaultProduct?: string;
  /** Stored with the requirement so suppliers see where it came from. */
  category?: string;
  subcategory?: string;
  /** Prefills the quantity (for example from a product page). */
  defaultQuantity?: string;
  /** Unit of the prefilled quantity, stored with the requirement. */
  unit?: string;
  /** Addresses the requirement to one supplier (from a supplier profile). */
  supplierId?: string;
  supplierName?: string;
}

export function RequirementForm({ defaultProduct = "", category, subcategory, defaultQuantity = "", unit, supplierId, supplierName }: RequirementFormProps) {
  const [values, setValues] = useState({ ...initialValues, product: defaultProduct, quantity: defaultQuantity });
  const [errors, setErrors] = useState<RequirementFormErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle"
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

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
    setNeedsSignIn(false);
    const result = await submitRequirement(values, { category, subcategory, unit, supplierId });

    if (result.status === "ok") {
      setStatus("ok");
      setStatusMessage("Your requirement has been submitted.");
      setValues(initialValues);
    } else {
      setStatus("error");
      setStatusMessage(result.message);
      setNeedsSignIn(Boolean(result.needsSignIn));
      if (result.fields) setErrors(result.fields);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {supplierName && (
        <p className={styles.supplierNote}>
          This requirement is addressed to <strong>{supplierName}</strong>.
        </p>
      )}
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
      {needsSignIn && <SignInPrompt className={styles.status} />}
    </form>
  );
}
